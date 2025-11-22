
function getIntersection(ray, segment) {
    const r_px = ray.p1.x;
    const r_py = ray.p1.y;
    const r_dx = ray.p2.x - ray.p1.x;
    const r_dy = ray.p2.y - ray.p1.y;

    const s_px = segment.p1.x;
    const s_py = segment.p1.y;
    const s_dx = segment.p2.x - segment.p1.x;
    const s_dy = segment.p2.y - segment.p1.y;

    const r_mag = Math.sqrt(r_dx * r_dx + r_dy * r_dy);
    const s_mag = Math.sqrt(s_dx * s_dx + s_dy * s_dy);

    if (r_dx / r_mag == s_dx / s_mag && r_dy / r_mag == s_dy / s_mag) return null; // Parallel

    const T2 = (r_dx * (s_py - r_py) + r_dy * (r_px - s_px)) / (s_dx * r_dy - s_dy * r_dx);
    const T1 = (s_px + s_dx * T2 - r_px) / r_dx;

    if (T1 < 0) return null; // Behind ray
    if (T2 < 0 || T2 > 1) return null; // Not on segment

    return {
        x: r_px + r_dx * T1,
        y: r_py + r_dy * T1,
        param: T1,
        T2: T2
    };
}

// Test Case: Ray aimed exactly at a segment endpoint
// Segment: (100, 100) to (200, 100)
const segment = { p1: { x: 100, y: 100 }, p2: { x: 200, y: 100 } };

// Ray from (50, 150) to (100, 100) (The endpoint p1)
const ray = { p1: { x: 50, y: 150 }, p2: { x: 100, y: 100 } };

const intersection = getIntersection(ray, segment);

console.log("Intersection:", intersection);

if (intersection) {
    console.log("Hit!");
} else {
    console.log("Miss (Bug?)");
}

// Test Case 2: Ray aimed slightly past endpoint due to float precision?
// Let's try to simulate the exact scenario in the game.
// Player at (120, 120). Corner at (100, 100).
// Ray angle calculated by atan2.
const px = 120, py = 120;
const cx = 100, cy = 100;
const angle = Math.atan2(cy - py, cx - px);
const ray2 = {
    p1: { x: px, y: py },
    p2: { x: px + Math.cos(angle), y: py + Math.sin(angle) }
};

const intersection2 = getIntersection(ray2, segment);
console.log("Intersection 2 (Angle calc):", intersection2);
