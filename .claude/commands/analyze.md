---
description: วิเคราะห์ Multi-Timeframe จากข้อมูลสด TradingView แล้วฟันธง entry/TP/SL พร้อม % — ใช้ได้ทุก asset (หุ้น/forex/crypto/commodity)
argument-hint: [symbol] [timeframe เช่น 5/15/60/D] — เว้นว่าง = ใช้ chart ปัจจุบัน
---

วิเคราะห์ trading setup จากข้อมูลสด TradingView แล้วตอบตามรูปแบบมาตรฐาน (ดู memory `feedback-analysis-format`)

**ใช้ได้กับทุกสินทรัพย์** — หุ้น, forex, crypto, commodity, futures, index ฯลฯ ไม่ผูกกับตัวใดตัวหนึ่ง

อาร์กิวเมนต์ผู้ใช้: `$ARGUMENTS`
- ถ้ามี symbol → `chart_set_symbol` ไปยัง symbol นั้นก่อน (รองรับทุกรูปแบบ เช่น `AAPL`, `EURUSD`, `BTCUSDT`, `XAUUSD`, `ES1!`, `NASDAQ:TSLA`)
  - ถ้าไม่แน่ใจ exchange/ฟอร์แมต ใช้ `symbol_search` ช่วยหา ticker ที่ถูกต้องก่อน
- ถ้าไม่ระบุ → วิเคราะห์ chart ปัจจุบัน (เรียก `chart_get_state` ดูก่อน)

**ปรับให้เข้ากับ asset class** (ดูจาก `symbol_info`/`quote_get` → type):
- ปรับทศนิยม/ขนาด pip ให้เหมาะ (forex 4-5 ตำแหน่ง, หุ้น 2 ตำแหน่ง, crypto แล้วแต่เหรียญ)
- ระวังเวลาทำการ: หุ้นมี session เปิด-ปิด + gap, forex/crypto เทรด 24 ชม. (crypto 24/7)
- TP/SL ระยะให้สมเหตุผลกับ volatility ของสินทรัพย์นั้น (อย่าใช้ระยะคงที่ข้าม asset)

## ขั้นตอน (ทำตามลำดับ ห้ามข้าม ห้ามเดา)

1. **ตรวจสถานะ:** `tv_health_check` — ถ้าต่อ CDP ไม่ติด ให้บอกผู้ใช้รันสคริปต์ `scripts/launch_tv_debug_mac_2.sh` ก่อน แล้วหยุด
2. **ดึงข้อมูลสด** (ห้าม hallucinate — ค่าไหนดึงไม่ได้ให้บอกตรงๆ):
   - `quote_get` → ราคาล่าสุด
   - `data_get_ohlcv` (summary=true) → range, change%, 5 แท่งล่าสุด
   - `data_get_study_values` → ค่า indicator มาตรฐาน (RSI, MACD, EMA ฯลฯ — ถ้า study_count=0 ให้แจ้งว่าอ่านไม่ได้)
   - ถ้ามี custom Pine indicator บน chart (ดูจาก `chart_get_state`) → `data_get_pine_labels`/`data_get_pine_lines` ด้วย study_filter ที่ให้โครงสร้างราคา (swing high/low, แนวรับ-ต้าน) — ถ้าไม่มีก็ข้ามได้ ใช้ swing จาก OHLCV แทน
   - แนวรับ-ต้าน: ถ้าไม่มี indicator ช่วย ให้หาเองจาก OHLCV (swing highs/lows, รอบราคากลม, high/low ของวัน)
3. **Multi-Timeframe** (ถ้าผู้ใช้ยอมให้สลับ TF): ดึง 1H (ภาพใหญ่) → 15m (โครงสร้าง/ถือ order) → 5m (จังหวะเข้า) ด้วย `chart_set_timeframe` แล้ว **สลับกลับ TF เดิมเสมอ** เมื่อเสร็จ
   - ถ้าผู้ใช้ไม่อยากให้สลับ chart สด ให้ถามก่อน หรือวิเคราะห์เฉพาะ TF ปัจจุบัน

## รูปแบบคำตอบ (บังคับครบทุกหัวข้อ)

1. **% ขาขึ้น vs ขาลง** (เช่น 🟢 ~57% | 🔴 ~43%) + ระบุกรอบเวลา
2. **ตารางถ่วงน้ำหนักปัจจัย** — 5m/15m/1H trend, โมเมนตัม, แนวต้าน-รับ ชี้ทางไหน
3. **เส้นตัดสิน (decision line)** — 2-3 ฉาก (ทะลุ/เด้งกลับ/ออกข้าง) พร้อม % แต่ละฉาก
4. **คำแนะนำฟันธง:** เล่นฝั่งไหน (LONG/SHORT/WAIT), entry zone ราคาเป๊ะ
5. **ตาราง probability:** TP1, TP2, TP3, SL — ราคาเป๊ะ + ระยะ + % โอกาสแตะ + R:R
6. **จุด invalidation** — ราคาที่ทำให้แผนเสีย แล้วต้องกลับข้าง
7. ปิดท้าย: เตือนถ้าเป็น counter-trend setup + ย้ำว่าตัวเลขมาจากข้อมูลสด ไม่ใช่การรับประกัน

ดู memory `trading-profile` สำหรับ instrument/สไตล์ที่ผู้ใช้เทรดประจำ
