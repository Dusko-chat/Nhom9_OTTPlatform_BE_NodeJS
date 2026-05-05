/**
 * UNIT TEST: CallService.js
 * Kiểm tra logic quản lý phòng gọi (không cần server chạy)
 * 
 * Chạy: node scripts/test-call-service.js
 */

const CallService = require('../src/services/CallService');

let passed = 0;
let failed = 0;

function assert(condition, message) {
    if (condition) {
        console.log(`  ✅ ${message}`);
        passed++;
    } else {
        console.error(`  ❌ FAIL: ${message}`);
        failed++;
    }
}

function deepEqual(a, b) {
    return JSON.stringify([...a].sort()) === JSON.stringify([...b].sort());
}

// ─────────────────────────────────────────────
// TEST 1: joinCall - người đầu tiên tạo phòng
// ─────────────────────────────────────────────
console.log('\n📋 Test 1: joinCall - Người đầu tiên tạo phòng');
const p1 = CallService.joinCall('conv-001', 'user-A');
assert(Array.isArray(p1), 'Trả về array');
assert(p1.includes('user-A'), 'user-A có trong participants');
assert(p1.length === 1, 'Chỉ có 1 người');

// ─────────────────────────────────────────────
// TEST 2: joinCall - người thứ 2 vào phòng
// ─────────────────────────────────────────────
console.log('\n📋 Test 2: joinCall - Người thứ 2 tham gia');
const p2 = CallService.joinCall('conv-001', 'user-B');
assert(p2.length === 2, 'Có 2 người trong phòng');
assert(p2.includes('user-A'), 'user-A vẫn trong phòng');
assert(p2.includes('user-B'), 'user-B đã vào phòng');

// ─────────────────────────────────────────────
// TEST 3: joinCall - người thứ 3 (3-person group call)
// ─────────────────────────────────────────────
console.log('\n📋 Test 3: joinCall - Người thứ 3 tham gia (group call)');
const p3 = CallService.joinCall('conv-001', 'user-C');
assert(p3.length === 3, 'Có 3 người trong phòng');
assert(p3.includes('user-C'), 'user-C đã vào phòng');

// ─────────────────────────────────────────────
// TEST 4: getParticipants
// ─────────────────────────────────────────────
console.log('\n📋 Test 4: getParticipants - Lấy danh sách người trong phòng');
const participants = CallService.getParticipants('conv-001');
assert(participants.length === 3, 'Lấy được 3 participants');
assert(participants.includes('user-A') && participants.includes('user-B') && participants.includes('user-C'), 'Đủ A, B, C');

// ─────────────────────────────────────────────
// TEST 5: getParticipants - phòng không tồn tại
// ─────────────────────────────────────────────
console.log('\n📋 Test 5: getParticipants - Phòng không tồn tại');
const none = CallService.getParticipants('conv-999');
assert(Array.isArray(none), 'Trả về array rỗng (không lỗi)');
assert(none.length === 0, 'Không có ai trong phòng không tồn tại');

// ─────────────────────────────────────────────
// TEST 6: joinCall - không cho join 2 lần (Set behavior)
// ─────────────────────────────────────────────
console.log('\n📋 Test 6: joinCall - Không được join 2 lần');
const p4 = CallService.joinCall('conv-001', 'user-A');
assert(p4.length === 3, 'Vẫn 3 người (không bị trùng)');

// ─────────────────────────────────────────────
// TEST 7: leaveCall - 1 người rời phòng
// ─────────────────────────────────────────────
console.log('\n📋 Test 7: leaveCall - User C rời phòng');
const leaveResult = CallService.leaveCall('conv-001', 'user-C');
assert(leaveResult !== null, 'Trả về callData (không null)');
assert(!leaveResult.participants.includes('user-C'), 'user-C đã rời');
assert(leaveResult.participants.length === 2, 'Còn 2 người');
assert(leaveResult.participants.includes('user-A'), 'user-A vẫn còn');
assert(leaveResult.participants.includes('user-B'), 'user-B vẫn còn');

// Phòng vẫn còn hoạt động
const afterLeave = CallService.getParticipants('conv-001');
assert(afterLeave.length === 2, 'Phòng vẫn tồn tại với 2 người');

// ─────────────────────────────────────────────
// TEST 8: leaveCall - người cuối cùng rời → phòng bị xóa
// ─────────────────────────────────────────────
console.log('\n📋 Test 8: leaveCall - Người cuối cùng rời (phòng bị xóa)');
CallService.leaveCall('conv-001', 'user-B');
const lastLeave = CallService.leaveCall('conv-001', 'user-A');
assert(lastLeave !== null, 'Trả về callData cuối cùng');
assert(lastLeave.participants.length === 0, 'Participants rỗng');
assert(lastLeave.startTime instanceof Date, 'startTime là Date object');

// Phòng đã bị xóa
const afterEmpty = CallService.getParticipants('conv-001');
assert(afterEmpty.length === 0, 'Phòng đã bị xóa (getParticipants trả về [])');

// ─────────────────────────────────────────────
// TEST 9: leaveCall - không tồn tại trong phòng
// ─────────────────────────────────────────────
console.log('\n📋 Test 9: leaveCall - Phòng không tồn tại');
const ghostLeave = CallService.leaveCall('conv-999', 'user-X');
assert(ghostLeave === null, 'Trả về null khi phòng không tồn tại');

// ─────────────────────────────────────────────
// TEST 10: Multiple conversations cùng lúc
// ─────────────────────────────────────────────
console.log('\n📋 Test 10: Multiple conversations độc lập');
CallService.joinCall('conv-A', 'user-1');
CallService.joinCall('conv-A', 'user-2');
CallService.joinCall('conv-B', 'user-3');
CallService.joinCall('conv-B', 'user-4');
CallService.joinCall('conv-B', 'user-5');

const pA = CallService.getParticipants('conv-A');
const pB = CallService.getParticipants('conv-B');

assert(pA.length === 2, 'conv-A có 2 người');
assert(pB.length === 3, 'conv-B có 3 người');

// Rời conv-A không ảnh hưởng conv-B
CallService.leaveCall('conv-A', 'user-1');
assert(CallService.getParticipants('conv-B').length === 3, 'conv-B không bị ảnh hưởng');
assert(CallService.getParticipants('conv-A').length === 1, 'conv-A chỉ còn 1 người');

// ─────────────────────────────────────────────
// TEST 11: Simulate full group call lifecycle (3 người)
// ─────────────────────────────────────────────
console.log('\n📋 Test 11: Full group call lifecycle (A gọi, B và C tham gia)');

// A khởi tạo cuộc gọi (join trước)
const step1 = CallService.joinCall('conv-grp', 'user-A');
assert(step1.length === 1 && step1[0] === 'user-A', 'Bước 1: A khởi tạo phòng');

// B chấp nhận và join
const step2 = CallService.joinCall('conv-grp', 'user-B');
assert(step2.length === 2, 'Bước 2: B vào phòng, có 2 người');
assert(step2.includes('user-A') && step2.includes('user-B'), 'Bước 2: A và B trong phòng');

// C chấp nhận và join
const step3 = CallService.joinCall('conv-grp', 'user-C');
assert(step3.length === 3, 'Bước 3: C vào phòng, có 3 người');

// Xác minh participants list gửi trong invite signal sẽ đúng
const atPeak = CallService.getParticipants('conv-grp');
assert(atPeak.length === 3, 'Đỉnh điểm: 3 người đang trong cuộc gọi');

// B rời trước
const bLeave = CallService.leaveCall('conv-grp', 'user-B');
assert(bLeave.participants.length === 2, 'B rời: còn 2 người (A và C)');
assert(CallService.getParticipants('conv-grp').length === 2, 'Phòng còn 2 người');

// A rời (chủ phòng)
const aLeave = CallService.leaveCall('conv-grp', 'user-A');
assert(aLeave.participants.length === 1, 'A rời: còn C');

// C là người cuối cùng, rời → phòng bị xóa
const cLeave = CallService.leaveCall('conv-grp', 'user-C');
assert(cLeave.participants.length === 0, 'C rời: phòng trống');
assert(CallService.getParticipants('conv-grp').length === 0, 'Phòng đã bị xóa');

// ─────────────────────────────────────────────
// SUMMARY
// ─────────────────────────────────────────────
console.log('\n' + '='.repeat(50));
console.log(`📊 KẾT QUẢ: ${passed} passed / ${passed + failed} total`);
if (failed === 0) {
    console.log('🎉 TẤT CẢ TEST PASSED!');
} else {
    console.log(`⚠️  ${failed} TEST FAILED!`);
    process.exit(1);
}
