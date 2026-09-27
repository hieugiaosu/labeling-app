# AAC-Bench listening study (web label)

Trang tĩnh (HTML + JS, không build) cho người label, đọc/ghi thẳng Supabase. Giao diện tiếng Anh.

- Nhập username → **Register new** (lần đầu) hoặc **Log in** (làm tiếp). Không có mật khẩu.
- Trang chủ: đã làm bao nhiêu câu (audio / text), nút **Audio batch** / **Text batch** (20 câu/batch; batch dở được giữ).
- Mỗi câu audio: nghe → (1) tick các âm nghe thấy (A-E, nhiều đáp án, hoặc *None of these*) → (2) chọn câu trả lời
  hợp lý nhất (các câu do LLM viết theo tổ hợp initiative / verbosity / addressee / risk / disclosure, có cả
  *Say nothing*) → (3) chọn cách nói: nhỏ / bình thường / to.
- Câu text: đọc mô tả tình huống (người dùng nói gì, có gì xảy ra) → (1) câu trả lời → (2) cách nói.
- Batch chia theo độ phủ: câu ít người làm nhất được giao trước (ngẫu nhiên khi ngang nhau), mỗi người một bộ
  khác nhau, và một người không bao giờ gặp lại cùng câu ở chế độ kia.
- **Admin** (mục *Admin* dưới form đăng nhập, cần mật khẩu admin): trang thống kê: độ phủ, độ khớp với nhãn benchmark theo từng policy / level, ma trận nhầm lẫn,
  nhận diện âm (key sounds), audio vs text trên cùng câu, theo section, theo người; tải CSV toàn bộ đáp án.

- Trang admin > **Contested scenarios**: theo từng kịch bản và policy, % người chọn khác nhãn benchmark và mức họ
  chọn nhiều nhất (đỏ = đa số không đồng ý). **Edit labels** sửa nhãn cả kịch bản (mọi biến thể), thống kê đổi ngay;
  *Back to original* hoàn lại. Bộ câu trả lời của mẫu không đổi, nên đáp án đã có vẫn chấm được.
- Kéo nhãn đã sửa về máy: `bash pull_labels.sh` (ghi `aac_bench_scenarios.jsonl` + nhật ký
  `pipeline/conf/bench/review/label_overrides.yaml`), rồi `rerender.sh`, `sync_supabase.sh`, `gen_label_tasks.sh`.
- Xoá đáp án: `bash reset_labels.sh --yes` (tài khoản giữ lại).

## Cài một lần

1. Supabase > SQL Editor: chạy `pipeline/supabase/schema.sql` (đã chạy) rồi `pipeline/supabase/label_app.sql`
   (chạy lại được; chạy lại mỗi khi file này đổi).
2. Sinh câu hỏi + đẩy lên (từ `pipeline/`, LLM qua CodexTerminal, có cache):
   ```sh
   /data5/miniconda3/envs/hieupt9-DAMAGE/bin/python tools/gen_label_tasks.py
   ```
   (render lại benchmark → `sync_supabase.py` rồi chạy lại lệnh này; câu đã sinh lấy từ cache.)
3. Đặt mật khẩu admin (một lần, SQL Editor; ít nhất 8 ký tự):
   ```sql
   insert into public.admin_config(id, password) values (1, '<mật khẩu>')
   on conflict (id) do update set password = excluded.password;
   ```
4. `config.js`: Supabase URL + **publishable** key (đã điền từ `.env`; không bao giờ để secret key ở đây).
   Publishable key được thiết kế để công khai: nó chỉ gọi được các hàm của app (đăng ký, lấy batch, nộp đáp án)
   và đọc audio; đáp án/nhãn và mọi chức năng admin cần mật khẩu admin, bảng không đọc trực tiếp được.

## Chạy / host

- Thử ở máy: `cd labeling-app && python3 -m http.server 8080` → http://localhost:8080
- GitHub Pages: đưa thư mục này lên một repo (hoặc `docs/`), Settings > Pages > branch. Netlify / Vercel /
  Cloudflare Pages: kéo thả thư mục, không cần build.
# labeling-app
