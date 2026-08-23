import test from 'node:test';
import assert from 'node:assert/strict';
import { meshAttendanceEngine, MeshAttendanceEngine } from '../src/services/meshAttendanceEngine.ts';

test('MeshAttendanceEngine routes multi-hop packets and ingests batch at lecturer node', () => {
    const engine = new MeshAttendanceEngine('test_mesh_key');
    const time = 1700000000000;

    // Student A generates mesh packet
    const pkt1 = engine.createStudentMeshPacket('4JC21CS001', 'sess_lab_basement', time);
    assert.equal(pkt1.hopCount, 0);

    // Relayed via Student B's phone
    const relay1 = engine.relayPacket(pkt1, '4JC21CS002', 4);
    assert.equal(relay1.success, true);
    assert.equal(relay1.relayedPacket?.hopCount, 1);
    assert.deepEqual(relay1.relayedPacket?.relayedByNodes, ['4JC21CS001', '4JC21CS002']);

    // Relayed via Student C's phone
    const relay2 = engine.relayPacket(relay1.relayedPacket!, '4JC21CS003', 4);
    assert.equal(relay2.success, true);
    assert.equal(relay2.relayedPacket?.hopCount, 2);

    // Lecturer receives packet batch
    const batch = engine.ingestMeshBatchAtLecturer([relay2.relayedPacket!], 'sess_lab_basement');
    assert.equal(batch.uniqueStudentsCheckedIn, 1);
    assert.deepEqual(batch.verifiedStudentUsns, ['4JC21CS001']);
    assert.equal(batch.rejectedCount, 0);
});

test('MeshAttendanceEngine drops loops and packets exceeding max hops', () => {
    const engine = new MeshAttendanceEngine('test_mesh_key');
    const pkt = engine.createStudentMeshPacket('4JC21CS005', 'sess_1', Date.now());

    // Loop detection: Node 4JC21CS005 tries to relay its own packet again
    const loopResult = engine.relayPacket(pkt, '4JC21CS005', 4);
    assert.equal(loopResult.success, false);
    assert.equal(loopResult.dropReason, 'LOOP_PREVENTION_NODE_SEEN');
});
