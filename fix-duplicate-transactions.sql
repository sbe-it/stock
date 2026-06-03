-- ============================================================
-- แก้ปัญหา "จำนวนขึ้น 2" ทั้งที่ของจริงมี 1
-- (เศษ transaction "เบิก" ซ้ำ จากบั๊กกดยืนยันรัว ๆ ตอนเก่า)
-- รันใน Supabase > SQL Editor ของโปรเจกต์จริง (yximjuyryktwkotlxiyr)
-- ทำทีละขั้น อ่านผลก่อนค่อยไปขั้นถัดไป
-- ============================================================

-- ขั้น 0: สำรองข้อมูลก่อน (กันเหนียว) กู้กลับได้จากตาราง _backup
create table if not exists transactions_backup as select * from transactions;
create table if not exists tools_backup as select * from tools;

-- ขั้น 1: ดูจำนวนจริงของ MD003 / MD004 และยอดเบิกที่ระบบคำนวณได้
select t.id, t.tool_code, t.total_stock, t.available_stock,
       coalesce(sum(case when tx.type='BORROW' then tx.quantity
                         when tx.type='RETURN' then -tx.quantity else 0 end),0) as เบิกสุทธิ
from tools t
left join transactions tx on tx.tool_id = t.id
where lower(trim(t.tool_code)) in ('md003','md004')
group by t.id, t.tool_code, t.total_stock, t.available_stock
order by t.tool_code;

-- ขั้น 2: ดูรายการ transaction ของสองตัวนี้ มองหาคู่ที่ซ้ำ
--         (tool/ไซ/ผู้เบิก/ชนิด/จำนวน เหมือนกัน เวลาห่างกันไม่กี่วินาที = ตัวซ้ำ)
select tx.id, t.tool_code, tx.type, tx.quantity, tx.site_id,
       tx.user_name, tx.receiver_name, tx.timestamp
from transactions tx
join tools t on t.id = tx.tool_id
where lower(trim(t.tool_code)) in ('md003','md004')
order by t.tool_code, tx.timestamp;

-- ขั้น 3: *** ดูผลขั้น 2 ก่อน *** แล้วค่อยรันลบ
-- 3a) PREVIEW ก่อน — แสดงแถวที่ "จะถูกลบ" (ตัวซ้ำที่เกิดภายใน 5 วินาที)
select a.id as จะลบ, b.id as เก็บไว้, a.tool_id, a.type, a.quantity, a.timestamp
from transactions a
join transactions b
  on a.id > b.id
 and a.tool_id = b.tool_id
 and coalesce(a.site_id,-1) = coalesce(b.site_id,-1)
 and a.user_name = b.user_name
 and a.type = b.type
 and a.quantity = b.quantity
 and abs(extract(epoch from (a.timestamp - b.timestamp))) < 5
order by a.tool_id, a.timestamp;

-- 3b) ถ้าผล 3a ถูกต้องแล้ว ค่อยรันลบจริง (ลบเฉพาะตัวซ้ำ เก็บ id เล็กสุด)
delete from transactions a
using transactions b
where a.id > b.id
  and a.tool_id = b.tool_id
  and coalesce(a.site_id,-1) = coalesce(b.site_id,-1)
  and a.user_name = b.user_name
  and a.type = b.type
  and a.quantity = b.quantity
  and abs(extract(epoch from (a.timestamp - b.timestamp))) < 5;

-- ขั้น 4: ปรับ "คงเหลือ" ให้ตรงกับ transaction ที่เหลือ (ทั้งตาราง ทำให้ตัวเลขสอดคล้องกัน)
update tools t
set available_stock = t.total_stock - coalesce((
  select sum(case when type='BORROW' then quantity else -quantity end)
  from transactions where tool_id = t.id), 0);

-- ขั้น 5: ตรวจซ้ำว่าตัวเลขถูกแล้ว (ควรไม่เกิน total_stock และไม่ติดลบ)
select t.id, t.tool_code, t.total_stock, t.available_stock,
       coalesce(sum(case when tx.type='BORROW' then tx.quantity
                         when tx.type='RETURN' then -tx.quantity else 0 end),0) as เบิกสุทธิ
from tools t
left join transactions tx on tx.tool_id = t.id
where lower(trim(t.tool_code)) in ('md003','md004')
group by t.id, t.tool_code, t.total_stock, t.available_stock
order by t.tool_code;
