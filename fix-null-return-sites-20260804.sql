-- ============================================================
-- ล้าง "ผี" ในหน้าภาพรวม/ไซงาน (เครื่องมือโผล่ 2 ที่ทั้งที่มีตัวเดียว)
--
-- สาเหตุ: ตอน "คืน" ผู้ใช้เลือก "คืนจากส่วนกลาง / ไม่ระบุไซ" (site_id = NULL)
-- ทั้งที่จริงเครื่องอยู่ที่ไซใดไซหนึ่ง การเบิกที่ไซนั้นเลยไม่ถูกหักล้าง
-- กลายเป็นยอดค้าง (ผี) ค้างอยู่ที่ไซเดิม
--
-- สคริปต์นี้ย้ายรายการ "คืน" (site_id NULL) กลับไปยังไซที่เบิกจริง
-- โดยเจาะจง id ที่ตรวจทานแล้วว่าถูกต้อง (เทียบกับยอดผีจริงทีละตัว)
-- รันใน Supabase > SQL Editor ของโปรเจกต์ yximjuyryktwkotlxiyr
-- ============================================================

-- ขั้น 0: สำรองข้อมูลก่อน (กันพลาด — ถ้าผิดค่อย restore จากตารางนี้)
create table if not exists transactions_backup_20260804 as select * from transactions;

-- ขั้น 1: แก้จริง — ห่อใน transaction เดียว (ผิดที่ใดที่หนึ่ง = ยกเลิกทั้งหมด)
begin;

update transactions set site_id=2 where id=180 and type='RETURN' and site_id is null; -- CM001 -> สยามอาทิตย์
update transactions set site_id=9 where id=258 and type='RETURN' and site_id is null; -- EFC056 -> เสลี่การพิมพ์ พนัสนิคม
update transactions set site_id=6 where id=278 and type='RETURN' and site_id is null; -- PD001 -> ซานเซิ่ง
update transactions set site_id=8 where id=575 and type='RETURN' and site_id is null; -- RE002 -> เดอ แฟมิลี่ ( โรงงาน )
update transactions set site_id=8 where id=583 and type='RETURN' and site_id is null; -- EHS023 -> เดอ แฟมิลี่ ( โรงงาน )
update transactions set site_id=8 where id=584 and type='RETURN' and site_id is null; -- EHS027 -> เดอ แฟมิลี่ ( โรงงาน )
update transactions set site_id=8 where id=585 and type='RETURN' and site_id is null; -- EHS028 -> เดอ แฟมิลี่ ( โรงงาน )
update transactions set site_id=1 where id=596 and type='RETURN' and site_id is null; -- EFC043 -> Royal Finishing
update transactions set site_id=1 where id=598 and type='RETURN' and site_id is null; -- CS006 -> Royal Finishing
update transactions set site_id=8 where id=600 and type='RETURN' and site_id is null; -- CV005 -> เดอ แฟมิลี่ ( โรงงาน )
update transactions set site_id=8 where id=601 and type='RETURN' and site_id is null; -- CW001 -> เดอ แฟมิลี่ ( โรงงาน )
update transactions set site_id=8 where id=602 and type='RETURN' and site_id is null; -- CW002 -> เดอ แฟมิลี่ ( โรงงาน )
update transactions set site_id=8 where id=603 and type='RETURN' and site_id is null; -- LC002 -> เดอ แฟมิลี่ ( โรงงาน )
update transactions set site_id=8 where id=604 and type='RETURN' and site_id is null; -- LC003 -> เดอ แฟมิลี่ ( โรงงาน )
update transactions set site_id=8 where id=605 and type='RETURN' and site_id is null; -- PT001 -> เดอ แฟมิลี่ ( โรงงาน )
update transactions set site_id=8 where id=606 and type='RETURN' and site_id is null; -- RE001 -> เดอ แฟมิลี่ ( โรงงาน )
update transactions set site_id=8 where id=607 and type='RETURN' and site_id is null; -- SM002 -> เดอ แฟมิลี่ ( โรงงาน )
update transactions set site_id=8 where id=608 and type='RETURN' and site_id is null; -- TP001 -> เดอ แฟมิลี่ ( โรงงาน )
update transactions set site_id=1 where id=619 and type='RETURN' and site_id is null; -- EHS022 -> Royal Finishing
update transactions set site_id=1 where id=621 and type='RETURN' and site_id is null; -- EFS020 -> Royal Finishing
update transactions set site_id=1 where id=623 and type='RETURN' and site_id is null; -- EFS032 -> Royal Finishing

commit;

-- ขั้น 2: ตรวจผล — ยอดเบิกสุทธิต่อไซของเครื่องที่แก้ ควรไม่มีไซไหน > ของที่ออกจริง
-- (ถ้ายังเห็นผี ให้ดูรายการที่ต้องเช็คมือด้านล่าง)
select t.tool_code,
       coalesce(s.name,'ส่วนกลาง') as site,
       sum(case when tx.type='BORROW' then tx.quantity else -tx.quantity end) as net_out
from transactions tx
join tools t on t.id = tx.tool_id
left join sites s on s.id = tx.site_id
where t.tool_code in ('CM001','EFC056','PD001','RE002','EHS023','EHS027','EHS028',
                      'EFC043','CS006','CV005','CW001','CW002','LC002','LC003',
                      'PT001','RE001','SM002','TP001','EHS022','EFS020','EFS032')
group by t.tool_code, s.name
having sum(case when tx.type='BORROW' then tx.quantity else -tx.quantity end) <> 0
order by t.tool_code;

-- ============================================================
-- ⚠️ ต้องเช็คมือ (สคริปต์ไม่แตะให้ เพราะจับคู่ไซอัตโนมัติแล้วอาจผิด):
--
-- 1) EEC026 (ปลั๊กพ่วง 100 ม.) — มีการคืน NULL หลายใบในอดีต (id 193, 222)
--    ยอดค้างเพี้ยนที่ "เกาสุ ศรีราชา" และ "ซานเซิ่ง" ต้องดูประวัติแล้วเลือกไซเอง:
--      select id,type,quantity,site_id,timestamp from transactions where tool_id=230 order by timestamp;
--
-- 2) MR003 (โม่ปูนฉาบ) — มีการเบิกที่ "กิตติพงษ์" ค้างไว้ แต่ของกลับเข้าคลังแล้ว
--    (available_stock เต็ม) และไม่มีใบคืน NULL ให้ย้าย — น่าจะลืมบันทึกคืน
--    ตรวจ:  select id,type,quantity,site_id,timestamp from transactions
--           where tool_id=(select id from tools where tool_code='MR003') order by timestamp;
--    ถ้ายืนยันว่าคืนแล้ว ให้เพิ่มใบคืนจากไซ "กิตติพงษ์" หรือปรับข้อมูลตามจริง
-- ============================================================
