-- ============================================================
-- แก้ปัญหา "รหัสเครื่องมือซ้ำ" (เช่น md003 โผล่ 2 ใบ)
-- รันใน Supabase > SQL Editor ของโปรเจกต์จริง (yximjuyryktwkotlxiyr)
-- ทำทีละขั้น อ่านผลก่อนค่อยไปขั้นถัดไป
-- ============================================================

-- ขั้นที่ 1: หาว่ามีรหัสไหนซ้ำบ้าง (เทียบแบบไม่สนพิมพ์เล็ก/ใหญ่/ช่องว่าง)
select lower(trim(tool_code)) as code_key,
       count(*) as จำนวนแถว,
       array_agg(id order by id) as ids,
       array_agg(tool_code order by id) as codes
from tools
group by lower(trim(tool_code))
having count(*) > 1;

-- ขั้นที่ 2: ดูรายละเอียดแถวที่ซ้ำของ md003 (ปรับรหัสตามผลขั้นที่ 1)
select id, tool_code, name, total_stock, available_stock, category_id
from tools
where lower(trim(tool_code)) = 'md003'
order by id;

-- ขั้นที่ 3: ย้ายประวัติ (transactions) ของแถวที่จะลบ ไปผูกกับแถวที่จะเก็บไว้
-- เก็บแถว id เล็กสุด (KEEP), ลบแถวที่เกิน (DUP)
-- *** แก้ตัวเลข id ให้ตรงกับผลขั้นที่ 2 ก่อนรัน ***
-- ตัวอย่าง: เก็บ id=5 (KEEP), ลบ id=12 (DUP)
-- update transactions set tool_id = 5 where tool_id = 12;
-- delete from tools where id = 12;

-- ----- หรือทำอัตโนมัติทั้งตาราง (เก็บ id เล็กสุดของแต่ละรหัส ลบที่เหลือ) -----
-- 3a) ย้ายประวัติของตัวซ้ำไปหาตัวที่เก็บไว้
with keep as (
  select lower(trim(tool_code)) as k, min(id) as keep_id
  from tools group by lower(trim(tool_code))
)
update transactions tx
set tool_id = keep.keep_id
from tools t
join keep on keep.k = lower(trim(t.tool_code))
where tx.tool_id = t.id and t.id <> keep.keep_id;

-- 3b) ลบแถวเครื่องมือที่ซ้ำ (เก็บ id เล็กสุดไว้)
delete from tools t
using (
  select lower(trim(tool_code)) as k, min(id) as keep_id
  from tools group by lower(trim(tool_code))
) keep
where lower(trim(t.tool_code)) = keep.k and t.id <> keep.keep_id;

-- ขั้นที่ 4: กันไม่ให้รหัสซ้ำได้อีกในระดับฐานข้อมูล (unique แบบไม่สนพิมพ์เล็ก/ใหญ่)
create unique index if not exists tools_tool_code_unique
  on tools (lower(trim(tool_code)));

-- ขั้นที่ 5 (ถ้าจำเป็น): แก้จำนวนคงเหลือของ md003 ให้ตรงของจริง
-- update tools set total_stock = 1, available_stock = 1
-- where lower(trim(tool_code)) = 'md003';
