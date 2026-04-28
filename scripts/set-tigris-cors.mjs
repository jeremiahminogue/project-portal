#!/usr/bin/env node
// One-shot: configure CORS on the Tigris (or any S3-compatible) bucket so the
// browser can PUT files directly to a presigned URL.
//
// Usage:
//   node scripts/set-tigris-cors.mjs                    # uses env vars from .env.local / shell
//   node scripts/set-tigris-cors.mjs --print            # show current CORS only, no write
//   node scripts/set-tigris-cors.mjs --origins=foo,bar  # extra allowed origins
//
// Env vars (the script reads the same names as the runtime — see object-storage.ts):
//   TIGRIS_ENDPOINT / R2_ENDPOINT / S3_ENDPOINT / AWS_ENDPOINT_URL_S3
//   TIGRIS_ACCESS_KEY_ID / R2_ACCESS_KEY_ID / S3_ACCESS_KEY_ID / AWS_ACCESS_KEY_ID
//   TIGRIS_SECRET_ACCESS_KEY / R2_SECRET_ACCESS_KEY / S3_SECRET_ACCESS_KEY / AWS_SECRET_ACCESS_KEY
//   TIGRIS_BUCKET / R2_BUCKET / S3_BUCKET / BUCKET_NAME
//   PUBLIC_SITE_URL (used as the primary AllowedOrigin when present)
//
// Re-run any time the allowed origins need to change. Tigris CORS is bucket-wide.

import { createHash, createHmac } from 'node:crypto';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const envPath = join(__dirname, '..', '.env.local');
if (existsSync(envPath)) {
  const text = readFileSync(envPath, 'utf8');
  for (const line of text.split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (!match) continue;
    if (process.env[match[1]] != null && process.env[match[1]] !== '') continue;
    let value = match[2];
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    process.env[match[1]] = value;
  }
}

function pickEnv(...names) {
  for (const name of names) {
    const raw = process.env[name];
    const cleaned = raw?.replace(/^﻿/, '').trim();
    if (cleaned) return cleaned;
  }
  return undefined;
}

const endpoint = pickEnv('TIGRIS_ENDPOINT', 'TIGRIS_ENDPOINT_URL', 'R2_ENDPOINT', 'AWS_ENDPOINT_URL_S3', 'S3_ENDPOINT', 'STORAGE_ENDPOINT');
const accessKeyId = pickEnv('TIGRIS_ACCESS_KEY_ID', 'R2_ACCESS_KEY_ID', 'AWS_ACCESS_KEY_ID', 'S3_ACCESS_KEY_ID', 'STORAGE_ACCESS_KEY_ID');
const secretAccessKey = pickEnv('TIGRIS_SECRET_ACCESS_KEY', 'R2_SECRET_ACCESS_KEY', 'AWS_SECRET_ACCESS_KEY', 'S3_SECRET_ACCESS_KEY', 'STORAGE_SECRET_ACCESS_KEY');
const bucket = pickEnv('TIGRIS_BUCKET', 'TIGRIS_BUCKET_NAME', 'R2_BUCKET', 'BUCKET_NAME', 'S3_BUCKET', 'STORAGE_BUCKET');
const region = pickEnv('TIGRIS_REGION', 'R2_REGION', 'AWS_REGION', 'S3_REGION', 'STORAGE_REGION') ?? 'auto';

if (!endpoint || !accessKeyId || !secretAccessKey || !bucket) {
  console.error('Missing storage env vars. Need endpoint, access key, secret, and bucket.');
  console.error('Found:', {
    endpoint: !!endpoint,
    accessKeyId: !!accessKeyId,
    secretAccessKey: !!secretAccessKey,
    bucket: !!bucket
  });
  process.exit(1);
}

const args = process.argv.slice(2);
const printOnly = args.includes('--print');
const extraOrigins = args
  .find((a) => a.startsWith('--origins='))
  ?.slice('--origins='.length)
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean) ?? [];

const baseOrigins = [
  pickEnv('PUBLIC_SITE_URL'),
  'https://portal.puebloelectrics.com',
  'http://localhost:5173',
  'http://localhost:3000',
  'http://localhost:4173'
].filter(Boolean);

const allowedOrigins = Array.from(new Set([...baseOrigins, ...extraOrigins]));

const corsXml = `<?xml version="1.0" encoding="UTF-8"?>
<CORSConfiguration>
  <CORSRule>
${allowedOrigins.map((o) => `    <AllowedOrigin>${o}</AllowedOrigin>`).join('\n')}
    <AllowedMethod>GET</AllowedMethod>
    <AllowedMethod>HEAD</AllowedMethod>
    <AllowedMethod>PUT</AllowedMethod>
    <AllowedMethod>POST</AllowedMethod>
    <AllowedMethod>DELETE</AllowedMethod>
    <AllowedHeader>*</AllowedHeader>
    <ExposeHeader>ETag</ExposeHeader>
    <ExposeHeader>Content-Length</ExposeHeader>
    <MaxAgeSeconds>3600</MaxAgeSeconds>
  </CORSRule>
</CORSConfiguration>
`;

const directTigris = endpoint.includes('t3.storage.dev') || endpoint.includes('storage.tigris.dev');
const forcePathStyle = !directTigris;

function awsEncode(value) {
  return encodeURIComponent(value).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
}

function hashHex(value) {
  return createHash('sha256').update(value).digest('hex');
}

function hmac(key, value) {
  return createHmac('sha256', key).update(value).digest();
}

function hmacHex(key, value) {
  return createHmac('sha256', key).update(value).digest('hex');
}

function signingKey(date) {
  const kDate = hmac(`AWS4${secretAccessKey}`, date);
  const kRegion = hmac(kDate, region);
  const kService = hmac(kRegion, 's3');
  return hmac(kService, 'aws4_request');
}

function amzNow(d = new Date()) {
  const iso = d.toISOString().replace(/[:-]|\.\d{3}/g, '');
  return { amzDate: iso, shortDate: iso.slice(0, 8) };
}

function buildTarget() {
  const u = new URL(endpoint);
  const basePath = u.pathname.replace(/\/+$/, '');
  const parts = [basePath];
  if (forcePathStyle) parts.push(awsEncode(bucket));
  const pathname = `/${parts.filter(Boolean).join('/')}`.replace(/\/+/g, '/');
  const host = forcePathStyle ? u.host : `${bucket}.${u.host}`;
  return { protocol: u.protocol, host, pathname: pathname || '/' };
}

function canonicalQuery(params) {
  return Object.entries(params)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${awsEncode(k)}=${awsEncode(v)}`)
    .join('&');
}

function signedHeaderNames(headers) {
  return Object.keys(headers).map((k) => k.toLowerCase()).sort().join(';');
}

function canonicalHeaders(headers) {
  return Object.entries(headers)
    .map(([k, v]) => [k.toLowerCase(), String(v).trim().replace(/\s+/g, ' ')])
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}:${v}\n`)
    .join('');
}

async function s3Request({ method, query = {}, body, extraHeaders = {} }) {
  const target = buildTarget();
  const { amzDate, shortDate } = amzNow();
  const payloadHash = body ? hashHex(body) : 'UNSIGNED-PAYLOAD';
  const headers = {
    host: target.host,
    'x-amz-content-sha256': payloadHash,
    'x-amz-date': amzDate,
    ...extraHeaders
  };
  if (body) {
    const md5 = createHash('md5').update(body).digest('base64');
    headers['content-md5'] = md5;
  }
  const queryStr = canonicalQuery(query);
  const scope = `${shortDate}/${region}/s3/aws4_request`;
  const canonicalRequest = [
    method,
    target.pathname,
    queryStr,
    canonicalHeaders(headers),
    signedHeaderNames(headers),
    payloadHash
  ].join('\n');
  const stringToSign = ['AWS4-HMAC-SHA256', amzDate, scope, hashHex(canonicalRequest)].join('\n');
  const signature = hmacHex(signingKey(shortDate), stringToSign);

  const requestHeaders = new Headers();
  for (const [k, v] of Object.entries(headers)) {
    if (k !== 'host') requestHeaders.set(k, v);
  }
  requestHeaders.set(
    'authorization',
    `AWS4-HMAC-SHA256 Credential=${accessKeyId}/${scope}, SignedHeaders=${signedHeaderNames(headers)}, Signature=${signature}`
  );

  const url = `${target.protocol}//${target.host}${target.pathname}${queryStr ? `?${queryStr}` : ''}`;
  return await fetch(url, { method, headers: requestHeaders, body: body ?? undefined });
}

async function getCors() {
  const res = await s3Request({ method: 'GET', query: { cors: '' } });
  const text = await res.text();
  return { status: res.status, body: text };
}

async function putCors() {
  const res = await s3Request({
    method: 'PUT',
    query: { cors: '' },
    body: corsXml,
    extraHeaders: { 'content-type': 'application/xml', 'content-length': String(Buffer.byteLength(corsXml)) }
  });
  const text = await res.text();
  return { status: res.status, body: text };
}

console.log(`Target: ${forcePathStyle ? 'path-style' : 'vhost-style'} ${endpoint}, bucket=${bucket}, region=${region}`);
console.log(`Allowed origins: ${allowedOrigins.join(', ')}`);

if (printOnly) {
  const cur = await getCors();
  console.log(`Current CORS (HTTP ${cur.status}):`);
  console.log(cur.body || '<empty>');
  process.exit(cur.status === 200 ? 0 : 1);
}

const before = await getCors();
console.log(`Before (HTTP ${before.status}):`);
console.log(before.body || '<empty>');

const result = await putCors();
console.log(`PutBucketCors -> HTTP ${result.status}`);
if (result.status >= 300) {
  console.error(result.body);
  process.exit(1);
}

const after = await getCors();
console.log(`After (HTTP ${after.status}):`);
console.log(after.body || '<empty>');
console.log('Done.');
