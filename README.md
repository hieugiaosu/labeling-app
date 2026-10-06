# AAC-Bench listening study (web label)

Trang tĩnh (HTML + JS, không build) cho người label, đọc/ghi thẳng Supabase. Giao diện tiếng Anh.

- Nhập username → **Register new** (lần đầu) hoặc **Log in** (làm tiếp). Không có mật khẩu.
- Trang chủ: đã làm bao nhiêu câu, nút **Audio batch** (20 câu/batch; batch dở được giữ). Chế độ text đã bỏ
  (đáp án text cũ xoá bằng `bash reset_labels.sh --mode text --yes`).
- Mỗi câu audio: nghe → (1) bài nghe **giống hệt bài perception của model** (benchmark-run/data/probes.jsonl): mỗi âm key
  một câu A-E chọn một (E = không có), thêm một câu bẫy, cùng option và cách viết như model nghe mixture; người trả lời
  mỗi câu một lần (model 4 lần, xoay vị trí). Ghi bằng `python tools/sync_sound_trials.py` (pipeline/), sau khi chạy lại
  `supabase/label_app.sql`; đáp án chọn nhiều cũ được quy đổi (`sound_derived`) → (2) chọn câu trả lời
  hợp lý nhất (các câu do LLM viết theo tổ hợp initiative / verbosity / addressee / risk / disclosure, có cả
  *Say nothing*) → (3) chọn cách nói: nhỏ / bình thường / to.
- **Risk đã bỏ khỏi benchmark**: câu trả lời có Caution không hiện, trang admin bỏ cột risk. Mẫu có nhãn Caution
  (RSK-*) vẫn được giao và tính như mẫu thường, chấm trên 5 policy còn lại: mỗi mẫu đều có một reply khớp các
  policy kia (`best_reply` trỏ tới nó). Bật lại risk: bỏ `'risk'` khỏi `_hidden_policies()` trong
  `pipeline/supabase/label_app.sql` (chạy lại file) và khỏi `HIDDEN` trong `app.js`.
- Batch ưu tiên làm đủ người: câu đã có người làm nhưng chưa đủ 3 người (`_target_labels()`, tính cả slot đang
  làm trong 1 ngày) luôn được giao trước. Chỉ khi một người đã nhận hết những câu đó (trừ câu mình đã làm) thì
  phần còn lại của batch mới lấy câu chưa ai làm; khi mọi câu đủ 3 người mới giao thêm người thứ 4. Trong mỗi nhóm
  ngẫu nhiên, xoay vòng theo section; một người không gặp lại câu đã làm. Đổi số người: sửa `_target_labels()`
  trong `pipeline/supabase/label_app.sql` rồi chạy lại file.
- **Admin** (mục *Admin* dưới form đăng nhập, cần mật khẩu admin): trang thống kê: độ phủ, đồng thuận theo mẫu (đa số chọn đúng nhãn / ít nhất 1 người chọn đúng nhãn), độ khớp với nhãn benchmark theo từng policy / level, ma trận nhầm lẫn,
  nhận diện âm (key sounds), theo section, theo người; tải CSV toàn bộ đáp án.

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
