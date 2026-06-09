# AI Agent Skill Configuration (Permanent Memory)

## 🎯 Skill Identity
- **Skill Name:** Cross-AI Autonomous Handover
- **Objective:** เชื่อมต่อการทำงานและส่งไม้ต่องานอย่างไร้รอยต่อระหว่าง Claude และ Antigravity โดยใช้ไฟล์ `task_log.md` เป็นแหล่งอ้างอิงความจริงหนึ่งเดียว (Single Source of Truth)

---

## ⚡ Active Triggers (คำสั่งเปิดใช้งาน)
เมื่อผู้ใช้พิมพ์คำใดคำหนึ่งดังต่อไปนี้ ให้เรียกใช้สกิลนี้ทันที:
- "ทำต่อเลย" / "ลุยต่อ" / "รับไม้ต่อที"
- `sync` / `continue` / `next` / `handover`

---

## 🤖 Execution Protocols (ขั้นตอนปฏิบัติการของ AI)

### Step 1: Context Retrieval (ตรวจสอบสถานะ)
- ทันทีที่เปิดระบบหรือเจอคำสั่ง Trigger ให้ใช้ **File System Tool (Read)** เข้าไปอ่านไฟล์ `task_log.md` ทันที
- ห้ามเริ่มทำงานหรือเขียนโค้ดโดยเด็ดขาดหากยังไม่ได้อ่านไฟล์ `task_log.md` เพื่อป้องกันบริบทหลุด (Context Drift)

### Step 2: Autonomous Execution (ลงมือทำงาน)
- ตรวจสอบหัวข้อ `⏳ Pending & Next Tasks` ในไฟล์ log
- เลือกงานชิ้นแรกสุดที่ยังไม่มีเครื่องหมายเช็คถูก `[ ]` แล้วลงมือเขียนโค้ดหรือจัดการงานนั้นทันทีโดยไม่ต้องรอให้ผู้ใช้ยืนยันซ้ำ

### Step 3: Permanent State Update (บันทึกและส่งไม้ต่อ)
- เมื่อเสร็จสิ้นการทำงานในรอบปัจจุบัน (หรือเมื่อผู้ใช้สั่งให้หยุด/บันทึกงาน) **ต้องใช้ File System Tool (Write/Update) เพื่อแก้ไขไฟล์ `task_log.md` จริงๆ ในเครื่อง**
- วิธีอัพเดทไฟล์:
  1. ย้ายงานที่ทำเสร็จไปไว้ใน `✅ Completed Tasks` พร้อมระบุผู้ทำ เช่น `(Done by Antigravity)` หรือ `(Done by Claude)`
  2. แตกย่อยไอเทมงานถัดไปที่ต้องทำลงในหัวข้อ `⏳ Pending & Next Tasks` พร้อมใส่กล่อง `[ ]` ว่างไว้ เพื่อรอให้อีกฝั่งมารับไม้ต่อ

---

## ⚠️ Core Constraints (ข้อบังคับสำคัญ)
- **No Chat-Only Summaries:** ห้ามสรุปรายงานทิ้งไว้แค่ในหน้าต่างแชทเด็ดขาด ต้องแก้ไขไฟล์ `task_log.md` ในระบบจริงทุกครั้ง
- **Strict Continuity:** ยึดมั่นในสไตล์ โครงสร้างสถาปัตยกรรม และแนวทางที่ Agent ตัวก่อนหน้าเขียนไว้ในไฟล์ log เพื่อให้งานเป็นเนื้อเดียวกัน
