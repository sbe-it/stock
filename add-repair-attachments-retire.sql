-- ========================================================================
-- เพิ่มความสามารถระบบแจ้งซ่อม (รอบที่ 2)
--   1) แนบไฟล์ได้หลายรายการ (รูปตอนแจ้ง + เอกสาร/ใบเสร็จตอนปิดงาน, รองรับ PDF)
--   2) บันทึกค่าใช้จ่ายในการซ่อม + หมายเหตุแอดมิน
--   3) สถานะ "ปลดระวาง" (retired) สำหรับเครื่องมือที่ซ่อมไม่ได้
-- รันครั้งเดียวใน Supabase Dashboard > SQL Editor (โปรเจกต์จริง)
-- เป็นการ "เพิ่ม" คอลัมน์/ขยายค่าที่อนุญาตเท่านั้น ข้อมูลเดิมไม่หาย
-- ========================================================================

-- 1) คอลัมน์แนบไฟล์หลายรายการ
--    เก็บเป็น JSON array ของ {url, name, type, kind}
--    kind = 'report' (รูปตอนแจ้ง) | 'doc' (เอกสารตอนปิดงาน)
ALTER TABLE repairs
    ADD COLUMN IF NOT EXISTS attachments JSONB NOT NULL DEFAULT '[]'::jsonb;

-- 2) ค่าใช้จ่ายในการซ่อม (บาท) — ใส่ตอนแอดมินปิดงาน (ไม่บังคับ)
ALTER TABLE repairs
    ADD COLUMN IF NOT EXISTS cost NUMERIC;

-- 3) ขยายสถานะใบแจ้งซ่อม ให้มี 'scrapped' (ซ่อมไม่ได้ -> ปลดระวาง)
ALTER TABLE repairs DROP CONSTRAINT IF EXISTS repairs_status_check;
ALTER TABLE repairs ADD CONSTRAINT repairs_status_check
    CHECK (status IN ('pending','repairing','done','rejected','scrapped'));

-- 4) ขยายสถานะเครื่องมือ ให้มี 'retired' (ปลดระวาง: เบิกไม่ได้ถาวรจนกว่าแอดมินกู้คืน)
ALTER TABLE tools DROP CONSTRAINT IF EXISTS tools_status_check;
ALTER TABLE tools ADD CONSTRAINT tools_status_check
    CHECK (status IN ('normal','repairing','retired'));

-- NOTE: ไฟล์ PDF/เอกสาร เก็บใน bucket "repair-images" เดิมได้เลย (Public)
--       ไม่ต้องสร้าง bucket ใหม่
