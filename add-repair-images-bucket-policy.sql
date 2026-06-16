-- ========================================================================
-- Storage policy สำหรับ bucket "repair-images"
-- รันหลังจากสร้าง bucket "repair-images" (แบบ Public) ใน Supabase Storage
-- ให้สิทธิ์อ่าน/อัป/แก้/ลบ เท่ากับ bucket tool-images / category-images
-- เป็นการ "เพิ่ม" policy เท่านั้น ไม่กระทบข้อมูลเดิม
-- ========================================================================

create policy "repair-images read"   on storage.objects for select using (bucket_id = 'repair-images');
create policy "repair-images insert" on storage.objects for insert with check (bucket_id = 'repair-images');
create policy "repair-images update" on storage.objects for update using (bucket_id = 'repair-images');
create policy "repair-images delete" on storage.objects for delete using (bucket_id = 'repair-images');
