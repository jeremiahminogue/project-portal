alter table files
  add column if not exists title_block_region jsonb;

comment on column files.title_block_region is
  'Normalized title block rectangle for drawing OCR, using x/y/width/height values from 0 to 1.';
