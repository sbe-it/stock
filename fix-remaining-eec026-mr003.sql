-- ============================================================
-- ล้างผี 2 เคสสุดท้าย (ที่ต้องเช็คประวัติด้วยมือ)
-- รันใน Supabase > SQL Editor ของโปรเจกต์ yximjuyryktwkotlxiyr
-- (ต่อจาก fix-null-return-sites-20260804.sql)
-- ============================================================

begin;

-- --- EEC026 (ปลั๊กพ่วง 100 ม., tool_id=230) ---
-- ของจริงอยู่ที่ "ซานเซิ่ง" (เบิก #469 ยังไม่คืน) — ถูกต้องแล้ว ไม่แตะ
-- แก้ 2 ใบที่บันทึกไซผิด:
update transactions set site_id=1 where id=222 and tool_id=230 and type='RETURN'; -- คืน NULL -> Royal Finishing (หักล้างเบิก #195)
update transactions set site_id=3 where id=467 and tool_id=230 and type='RETURN'; -- คืน Royal -> เกาสุ ศรีราชา (หักล้างเบิก #420 จริง)

-- --- MR003 (โม่ปูนฉาบ, tool_id=301) ---
-- มีใบเบิกไป "กิตติพงษ์" (#293) แต่ไม่มีใบคืน (ลืมบันทึก) ของกลับเข้าคลังแล้ว
-- เพิ่มใบคืนจาก "กิตติพงษ์" เพื่อปิดยอด (ไม่แตะ available_stock เพราะถูกอยู่แล้ว = 1)
insert into transactions (tool_id, site_id, user_name, receiver_name, type, quantity)
values (301, 4, 'เบียร์', 'แก้ยอดค้าง (ระบบ)', 'RETURN', 1);

commit;

-- ตรวจผล: ทั้งสองเครื่องควรเหลือยอดค้างเฉพาะไซที่ถืออยู่จริง (EEC026=ซานเซิ่ง, MR003=ไม่มี)
select t.tool_code, coalesce(s.name,'ส่วนกลาง') as site,
       sum(case when tx.type='BORROW' then tx.quantity else -tx.quantity end) as net_out
from transactions tx
join tools t on t.id = tx.tool_id
left join sites s on s.id = tx.site_id
where t.tool_code in ('EEC026','MR003')
group by t.tool_code, s.name
having sum(case when tx.type='BORROW' then tx.quantity else -tx.quantity end) <> 0
order by t.tool_code;
