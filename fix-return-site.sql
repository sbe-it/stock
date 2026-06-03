-- ============================================================
-- แก้ "จำนวนขึ้น 2" ในหน้าไซงาน (สาเหตุจริง)
-- ตอน "คืน" ระบบเก่าบันทึก site_id = NULL การคืนเลยไม่ถูกหักออกจากไซ
-- ที่เบิกไป ทำให้ไซนั้นยังนับว่ามีของอยู่
--
-- สคริปต์นี้ผูกรายการ "คืน" เก่า (site_id ว่าง) กลับไปยังไซที่เบิกไป
-- โดยอิงจากรายการ "เบิก" ครั้งล่าสุดก่อนหน้าการคืนนั้นของเครื่องมือเดียวกัน
-- รันใน Supabase > SQL Editor ของโปรเจกต์ yximjuyryktwkotlxiyr
-- ============================================================

-- ขั้น 0: สำรองข้อมูลก่อน
create table if not exists transactions_backup as select * from transactions;

-- ขั้น 1: PREVIEW — ดูว่าการคืนแต่ละใบจะถูกผูกไปไซไหน (ยังไม่แก้)
select r.id as return_id, r.tool_id, r.timestamp as คืนเมื่อ,
       (select b.site_id from transactions b
        where b.tool_id = r.tool_id and b.type='BORROW' and b.site_id is not null
          and b.timestamp <= r.timestamp
        order by b.timestamp desc limit 1) as จะผูกไปไซ
from transactions r
where r.type='RETURN' and r.site_id is null
order by r.tool_id, r.timestamp;

-- ขั้น 2: ถ้าผลขั้น 1 ถูกต้อง ค่อยรันอัปเดตจริง
update transactions r
set site_id = (
  select b.site_id from transactions b
  where b.tool_id = r.tool_id and b.type='BORROW' and b.site_id is not null
    and b.timestamp <= r.timestamp
  order by b.timestamp desc limit 1)
where r.type='RETURN' and r.site_id is null
  and exists (
    select 1 from transactions b
    where b.tool_id = r.tool_id and b.type='BORROW' and b.site_id is not null
      and b.timestamp <= r.timestamp);

-- ขั้น 3: ตรวจผลของ MD003 / MD004 (ยอดเบิกสุทธิต่อไซควรไม่เกินของจริง)
select t.tool_code, tx.site_id,
       sum(case when tx.type='BORROW' then tx.quantity else -tx.quantity end) as เบิกสุทธิ
from tools t
join transactions tx on tx.tool_id = t.id
where lower(trim(t.tool_code)) in ('md003','md004')
group by t.tool_code, tx.site_id
order by t.tool_code, tx.site_id;

-- หลังรันเสร็จ รีเฟรชหน้าเว็บ หน้าไซงานจะแสดงจำนวนที่ถูกต้อง
