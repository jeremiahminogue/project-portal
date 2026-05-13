update drawing_pages
set revision = '1'
where revision is null
  or btrim(revision) = ''
  or btrim(revision) = '0'
  or btrim(revision) !~ '^[1-9][0-9]*$';

update files
set revision = '1'
where document_kind = 'drawing'
  and (
    revision is null
    or btrim(revision) = ''
    or btrim(revision) = '0'
    or btrim(revision) !~ '^[1-9][0-9]*$'
  );
