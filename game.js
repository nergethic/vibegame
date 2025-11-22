/**
 * NEON GLITCH ENGINE
 * A lightweight 2D top-down shooter engine with raycasting visibility.
 */

// --- CONSTANTS & CONFIG ---
const COLORS = {
    bg: '#050505',
    wall: '#222',
    wallStroke: '#00f3ff',
    player: '#0aff00',
    enemy: '#ff00ff',
    bullet: '#ffff00',
    loot: '#ffffff'
};

const TILE_SIZE = 40;
const FOV_RADIUS = 350;
const ENEMY_SPEED = 1.5;
const PLAYER_SPEED = 2.5;

// --- DOM ELEMENTS ---
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const uiHpVal = document.getElementById('hp-val');
const uiHpBar = document.getElementById('hp-bar');
const uiAmmoVal = document.getElementById('ammo-val');
const uiAmmoBar = document.getElementById('ammo-bar');
const logContainer = document.getElementById('console-log');
const deathScreen = document.getElementById('death-screen');
const inventoryList = document.getElementById('inventory-list');

// --- STATE ---
let width, height;
let lastTime = 0;
let keys = {};
let mouse = { x: 0, y: 0 };
let camera = { x: 0, y: 0 };
let gameActive = true;
let glitchIntensity = 0;

const map = {
    width: 40,
    height: 40,
    tiles: [], // 0: floor, 1: wall
    walls: [] // Line segments for raycasting
};

const player = {
    x: 100, y: 100,
    radius: 8,
    angle: 0,
    hp: 100,
    maxHp: 100,
    ammo: 24,
    maxAmmo: 48,
    reloading: false,
    inventory: {
        medkits: 1,
        scrap: 0
    }
};

const entities = []; // Enemies, Bullets, Particles, Loot

// --- UTILS ---
function resize() {
    width = canvas.width = document.getElementById('canvas-wrapper').offsetWidth;
    height = canvas.height = document.getElementById('canvas-wrapper').offsetHeight;
}
window.addEventListener('resize', resize);

function log(msg, type = 'info') {
    const div = document.createElement('div');
    div.className = `log-msg ${type}`;
    div.textContent = `> ${msg}`;
    logContainer.prepend(div);
    if (logContainer.children.length > 10) logContainer.lastChild.remove();
}

function rand(min, max) { return Math.random() * (max - min) + min; }
function dist(x1, y1, x2, y2) { return Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2); }

// --- MAP GENERATION ---
function generateMap() {
    // Simple Cellular Automata or Random Walker
    // Let's do a simple room carver for "corridors" feel
    for (let i = 0; i < map.width * map.height; i++) map.tiles[i] = 1; // Fill solid

    let x = Math.floor(map.width / 2);
    let y = Math.floor(map.height / 2);

    player.x = x * TILE_SIZE + TILE_SIZE / 2;
    player.y = y * TILE_SIZE + TILE_SIZE / 2;

    const carvers = [{ x, y }];

    for (let i = 0; i < 400; i++) {
        const c = carvers[Math.floor(Math.random() * carvers.length)];
        const dir = Math.floor(Math.random() * 4);
        let dx = 0, dy = 0;
        if (dir === 0) dy = -1;
        if (dir === 1) dy = 1;
        if (dir === 2) dx = -1;
        if (dir === 3) dx = 1;

        let nx = c.x + dx;
        let ny = c.y + dy;

        if (nx > 1 && nx < map.width - 1 && ny > 1 && ny < map.height - 1) {
            map.tiles[ny * map.width + nx] = 0;
            // Carve wider halls sometimes
            if (Math.random() > 0.7) {
                map.tiles[ny * map.width + nx + 1] = 0;
                map.tiles[(ny + 1) * map.width + nx] = 0;
            }
            carvers.push({ x: nx, y: ny });

            // Chance to spawn entity
            if (Math.random() < 0.02 && dist(nx * TILE_SIZE, ny * TILE_SIZE, player.x, player.y) > 300) {
                spawnEnemy(nx * TILE_SIZE + TILE_SIZE / 2, ny * TILE_SIZE + TILE_SIZE / 2);
            }
            if (Math.random() < 0.01) {
                spawnLoot(nx * TILE_SIZE + TILE_SIZE / 2, ny * TILE_SIZE + TILE_SIZE / 2, Math.random() > 0.5 ? 'ammo' : 'medkit');
            }
        }
    }

    // Convert tiles to line segments for raycasting
    buildWalls();
}

function buildWalls() {
    map.walls = [];
    // Add boundary walls
    map.walls.push({ p1: { x: 0, y: 0 }, p2: { x: map.width * TILE_SIZE, y: 0 } });
    map.walls.push({ p1: { x: map.width * TILE_SIZE, y: 0 }, p2: { x: map.width * TILE_SIZE, y: map.height * TILE_SIZE } });
    map.walls.push({ p1: { x: map.width * TILE_SIZE, y: map.height * TILE_SIZE }, p2: { x: 0, y: map.height * TILE_SIZE } });
    map.walls.push({ p1: { x: 0, y: map.height * TILE_SIZE }, p2: { x: 0, y: 0 } });

    // Optimize: Only add segments between wall and floor
    // This is a simplified approach. A proper one traces contours.
    // For this demo, we treat every wall tile block as 4 segments is too slow.
    // We will check neighbors.

    for (let y = 1; y < map.height - 1; y++) {
        for (let x = 1; x < map.width - 1; x++) {
            if (map.tiles[y * map.width + x] === 1) {
                const sx = x * TILE_SIZE;
                const sy = y * TILE_SIZE;

                // Check neighbors to see if edge is exposed
                if (map.tiles[y * map.width + (x - 1)] === 0) // Left
                    map.walls.push({ p1: { x: sx, y: sy }, p2: { x: sx, y: sy + TILE_SIZE } });
                if (map.tiles[y * map.width + (x + 1)] === 0) // Right
                    map.walls.push({ p1: { x: sx + TILE_SIZE, y: sy }, p2: { x: sx + TILE_SIZE, y: sy + TILE_SIZE } });
                if (map.tiles[(y - 1) * map.width + x] === 0) // Top
                    map.walls.push({ p1: { x: sx, y: sy }, p2: { x: sx + TILE_SIZE, y: sy } });
                if (map.tiles[(y + 1) * map.width + x] === 0) // Bottom
                    map.walls.push({ p1: { x: sx, y: sy + TILE_SIZE }, p2: { x: sx + TILE_SIZE, y: sy + TILE_SIZE } });
            }
        }
    }
}

// --- RAYCASTING & VISIBILITY ---
// Returns intersection point {x, y, param} or null
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

    // FIX: Added epsilon tolerance to prevent light leaks at corners
    if (T1 < -0.0001) return null; // Behind ray
    if (T2 < -0.0001 || T2 > 1.0001) return null; // Not on segment

    return {
        x: r_px + r_dx * T1,
        y: r_py + r_dy * T1,
        param: T1
    };
}

function getVisibilityPolygon(x, y) {
    let points = [];
    const uniquePoints = [];

    // We only care about walls near the player to optimize
    const relevantWalls = map.walls.filter(w => {
        return Math.abs((w.p1.x + w.p2.x) / 2 - x) < FOV_RADIUS &&
            Math.abs((w.p1.y + w.p2.y) / 2 - y) < FOV_RADIUS;
    });

    // Add wall endpoints to angles
    for (let w of relevantWalls) {
        uniquePoints.push(w.p1, w.p2);
    }

    // Add corners of FOV box approx (optional, helps closes polygon)
    const angles = [];
    for (let p of uniquePoints) {
        const angle = Math.atan2(p.y - y, p.x - x);
        angles.push(angle - 0.00001, angle, angle + 0.00001);
    }

    // Sort angles
    angles.sort((a, b) => a - b);

    // Cast rays
    const polygon = [];
    for (let a of angles) {
        const ray = {
            p1: { x, y },
            p2: { x: x + Math.cos(a), y: y + Math.sin(a) }
        };

        // Find closest intersection
        let closest = null;
        let minT = Infinity;

        for (let w of relevantWalls) {
            const intersect = getIntersection(ray, w);
            if (intersect && intersect.param < minT) {
                minT = intersect.param;
                closest = intersect;
            }
        }

        if (closest) {
            // Cap at FOV radius visual
            if (dist(x, y, closest.x, closest.y) > FOV_RADIUS) {
                closest.x = x + Math.cos(a) * FOV_RADIUS;
                closest.y = y + Math.sin(a) * FOV_RADIUS;
            }
            polygon.push(closest);
        } else {
            polygon.push({
                x: x + Math.cos(a) * FOV_RADIUS,
                y: y + Math.sin(a) * FOV_RADIUS
            });
        }
    }
    return polygon;
}

// --- ENTITIES ---
function spawnEnemy(x, y) {
    entities.push({
        type: 'enemy',
        x, y,
        hp: 30,
        radius: 10,
        state: 'idle', // idle, chase, alert
        timer: 0
    });
}

function spawnLoot(x, y, kind) {
    entities.push({
        type: 'loot',
        kind,
        x, y,
        radius: 6,
        bobOffset: Math.random() * Math.PI * 2
    });
}

function spawnBullet(x, y, angle, owner) {
    entities.push({
        type: 'bullet',
        x, y,
        vx: Math.cos(angle) * 12,
        vy: Math.sin(angle) * 12,
        owner, // 'player' or 'enemy'
        life: 60
    });
}

function spawnParticle(x, y, color) {
    entities.push({
        type: 'particle',
        x, y,
        vx: (Math.random() - 0.5) * 4,
        vy: (Math.random() - 0.5) * 4,
        life: rand(10, 30),
        color
    });
}

// --- INPUT ---
window.addEventListener('keydown', e => {
    keys[e.key.toLowerCase()] = true;
    if (e.key === 'r') reload();
    if (e.key === 'e') interact();
    if (e.key === '1') useItem('medkit');
});
window.addEventListener('keyup', e => keys[e.key.toLowerCase()] = false);
window.addEventListener('mousemove', e => {
    const rect = canvas.getBoundingClientRect();
    mouse.x = e.clientX - rect.left;
    mouse.y = e.clientY - rect.top;
});
window.addEventListener('mousedown', e => {
    if (gameActive && player.ammo > 0 && !player.reloading) {
        shoot();
    } else if (player.ammo <= 0) {
        log("Click... Empty.", "alert");
    }
});

function updateInventoryUI() {
    const list = document.getElementById('inventory-list');
    // Clear dynamic items (keep first one as weapon placeholder)
    while (list.children.length > 1) list.removeChild(list.lastChild);

    if (player.inventory.medkits > 0) {
        const div = document.createElement('div');
        div.className = 'inv-item';
        div.innerHTML = `<span>[1] Medkit</span><small>x${player.inventory.medkits}</small>`;
        list.appendChild(div);
    }
    if (player.inventory.scrap > 0) {
        const div = document.createElement('div');
        div.className = 'inv-item';
        div.innerHTML = `<span>Scrap Metal</span><small>x${player.inventory.scrap}</small>`;
        list.appendChild(div);
    }
}

function useItem(item) {
    if (item === 'medkit' && player.inventory.medkits > 0) {
        if (player.hp >= player.maxHp) {
            log("Integrity full.");
            return;
        }
        player.inventory.medkits--;
        player.hp = Math.min(player.hp + 40, player.maxHp);
        log("Medkit used. Integrity restored.", "info");
        updateInventoryUI();
    }
}

function interact() {
    // Find closest loot
    const reach = 40;
    let found = false;
    entities.forEach((e, i) => {
        if (e.type === 'loot' && dist(player.x, player.y, e.x, e.y) < reach) {
            if (e.kind === 'ammo') {
                player.ammo = Math.min(player.ammo + 12, player.maxAmmo);
                log("Picked up Ammo Cartridge.", "loot");
            } else if (e.kind === 'medkit') {
                player.inventory.medkits++;
                log("Picked up Auto-Injector.", "loot");
            }
            entities.splice(i, 1);
            found = true;
            updateInventoryUI();
        }
    });
    if (!found) log("Nothing to interact with.");
}

function reload() {
    if (player.ammo === player.maxAmmo) return;
    player.reloading = true;
    log("Reloading...", "info");
    setTimeout(() => {
        player.reloading = false;
        // In this simple version, infinite reserve ammo isn't tracked, just clip
        // Usually Teleglitch is scarce. Let's assume we found a clip on the ground.
        // Wait, I implemented looting ammo. 
        // Let's say 'ammo' variable is total ammo. 
        // And we don't have clips. Just a pool.
        // So reload isn't really needed unless we implement magazines.
        // Let's just print "Weapon Checked" for flavor
        log("Weapon mechanism cycled.");
    }, 1000);
}

function shoot() {
    player.ammo--;
    // Screen shake
    camera.x += (Math.random() - 0.5) * 10;
    camera.y += (Math.random() - 0.5) * 10;

    // Recoil angle
    const spread = (Math.random() - 0.5) * 0.1;
    spawnBullet(player.x, player.y, player.angle + spread, 'player');

    // Muzzle flash light
    // We simulate this by just drawing a flash next frame
}

// --- UPDATE ---
function update(dt) {
    if (!gameActive) return;

    // Player Movement
    let dx = 0, dy = 0;
    if (keys['w']) dy = -1;
    if (keys['s']) dy = 1;
    if (keys['a']) dx = -1;
    if (keys['d']) dx = 1;

    // Normalize
    if (dx != 0 || dy != 0) {
        const l = Math.sqrt(dx * dx + dy * dy);
        dx /= l; dy /= l;

        let nextX = player.x + dx * PLAYER_SPEED;
        let nextY = player.y + dy * PLAYER_SPEED;

        // Simple collision with map grid
        if (map.tiles[Math.floor(nextY / TILE_SIZE) * map.width + Math.floor(nextX / TILE_SIZE)] === 0) {
            player.x = nextX;
            player.y = nextY;
        } else if (map.tiles[Math.floor(player.y / TILE_SIZE) * map.width + Math.floor(nextX / TILE_SIZE)] === 0) {
            player.x = nextX; // Slide X
        } else if (map.tiles[Math.floor(nextY / TILE_SIZE) * map.width + Math.floor(player.x / TILE_SIZE)] === 0) {
            player.y = nextY; // Slide Y
        }
    }

    // Aim
    // Convert mouse screen pos to world pos
    const worldMouseX = mouse.x + camera.x;
    const worldMouseY = mouse.y + camera.y;
    player.angle = Math.atan2(worldMouseY - player.y, worldMouseX - player.x);

    // Camera Follow (Smooth)
    const targetCamX = player.x - width / 2;
    const targetCamY = player.y - height / 2;
    camera.x += (targetCamX - camera.x) * 0.1;
    camera.y += (targetCamY - camera.y) * 0.1;

    // Update Entities
    for (let i = entities.length - 1; i >= 0; i--) {
        const e = entities[i];

        if (e.type === 'bullet') {
            e.x += e.vx;
            e.y += e.vy;
            e.life--;

            // Wall collision
            const tx = Math.floor(e.x / TILE_SIZE);
            const ty = Math.floor(e.y / TILE_SIZE);
            if (tx < 0 || tx >= map.width || ty < 0 || ty >= map.height || map.tiles[ty * map.width + tx] === 1) {
                spawnParticle(e.x, e.y, COLORS.wallStroke);
                entities.splice(i, 1);
                continue;
            }

            // Entity collision
            let hit = false;
            if (e.owner === 'player') {
                entities.forEach(target => {
                    if (target.type === 'enemy' && dist(e.x, e.y, target.x, target.y) < target.radius + 5) {
                        target.hp -= 10;
                        spawnParticle(target.x, target.y, COLORS.enemy);
                        hit = true;
                        if (target.hp <= 0) {
                            // Drop loot chance
                            if (Math.random() > 0.5) spawnLoot(target.x, target.y, 'ammo');
                        }
                    }
                });
            } else { // Enemy bullet
                if (dist(e.x, e.y, player.x, player.y) < player.radius + 5) {
                    player.hp -= 10;
                    hit = true;
                    glitchIntensity = 10; // Screen glitch on hit
                    log("WARNING: DAMAGE DETECTED", "alert");
                }
            }

            if (hit || e.life <= 0) entities.splice(i, 1);
        }

        else if (e.type === 'enemy') {
            if (e.hp <= 0) {
                log("Target eliminated.", "info");
                entities.splice(i, 1);
                continue;
            }

            const d = dist(e.x, e.y, player.x, player.y);

            // Basic AI
            // Check line of sight roughly
            if (d < 300) {
                // Raycast check for walls between enemy and player would be better, 
                // for now simple distance check + aggro
                e.state = 'chase';
            }

            if (e.state === 'chase') {
                const ang = Math.atan2(player.y - e.y, player.x - e.x);
                const vx = Math.cos(ang) * ENEMY_SPEED;
                const vy = Math.sin(ang) * ENEMY_SPEED;

                // Move if no wall
                const nx = e.x + vx;
                const ny = e.y + vy;
                if (map.tiles[Math.floor(ny / TILE_SIZE) * map.width + Math.floor(nx / TILE_SIZE)] === 0) {
                    e.x = nx;
                    e.y = ny;
                }

                // Shoot
                e.timer++;
                if (e.timer > 60 && d < 200) {
                    spawnBullet(e.x, e.y, ang, 'enemy');
                    e.timer = 0;
                }
            }
        }

        else if (e.type === 'particle') {
            e.x += e.vx;
            e.y += e.vy;
            e.life--;
            e.vx *= 0.9;
            e.vy *= 0.9;
            if (e.life <= 0) entities.splice(i, 1);
        }

        else if (e.type === 'loot') {
            e.bobOffset += 0.1;
        }
    }

    // Status checks
    if (player.hp <= 0) {
        gameActive = false;
        deathScreen.style.display = 'flex';
        uiHpVal.textContent = "CRITICAL";
        uiHpBar.style.width = "0%";
    } else {
        uiHpVal.textContent = player.hp + "%";
        uiHpBar.style.width = (player.hp / player.maxHp) * 100 + "%";
        uiHpBar.style.background = player.hp < 30 ? COLORS.bullet : COLORS.player;
    }
    uiAmmoVal.textContent = player.ammo;
    uiAmmoBar.style.width = (player.ammo / player.maxAmmo) * 100 + "%";

    if (glitchIntensity > 0) glitchIntensity--;
}

// --- RENDER ---
function render() {
    // Clear
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, width, height);

    // Save context for camera
    ctx.save();

    // Apply Camera Shake & Glitch Offset
    let gx = 0, gy = 0;
    if (glitchIntensity > 0) {
        gx = (Math.random() - 0.5) * glitchIntensity * 2;
        gy = (Math.random() - 0.5) * glitchIntensity * 2;
    }
    ctx.translate(-camera.x + gx, -camera.y + gy);

    // 1. Draw Floor Grid (Cyberpunk style)
    ctx.strokeStyle = '#111';
    ctx.lineWidth = 1;
    const startCol = Math.floor(camera.x / TILE_SIZE);
    const endCol = startCol + (width / TILE_SIZE) + 1;
    const startRow = Math.floor(camera.y / TILE_SIZE);
    const endRow = startRow + (height / TILE_SIZE) + 1;

    for (let c = startCol; c <= endCol; c++) {
        for (let r = startRow; r <= endRow; r++) {
            // if (map.tiles[r * map.width + c] === 0) { // If floor
            ctx.strokeRect(c * TILE_SIZE, r * TILE_SIZE, TILE_SIZE, TILE_SIZE);
            // }
        }
    }

    // 2. Calculate Vision Polygon
    const poly = getVisibilityPolygon(player.x, player.y);

    // 3. CLIP EVERYTHING OUTSIDE VISION (Teleglitch Style)
    ctx.save();
    ctx.beginPath();
    if (poly.length > 0) {
        ctx.moveTo(poly[0].x, poly[0].y);
        for (let i = 1; i < poly.length; i++) ctx.lineTo(poly[i].x, poly[i].y);
    }
    ctx.closePath();
    ctx.clip();

    // --- INSIDE VISION ---

    // Draw visible floor slightly brighter
    ctx.fillStyle = '#0a0a0a';
    ctx.fillRect(camera.x, camera.y, width, height); // Fill visible area

    // Draw Walls
    ctx.fillStyle = COLORS.bg; // Wall fill
    ctx.strokeStyle = COLORS.wallStroke; // Neon edge
    ctx.lineWidth = 2;

    // We draw walls that are in the map
    // Optimization: Only draw walls around player
    // But since we are clipped, we can just iterate visible range
    for (let y = startRow - 1; y <= endRow + 1; y++) {
        for (let x = startCol - 1; x <= endCol + 1; x++) {
            if (x >= 0 && x < map.width && y >= 0 && y < map.height) {
                if (map.tiles[y * map.width + x] === 1) {
                    ctx.fillRect(x * TILE_SIZE, y * TILE_SIZE, TILE_SIZE, TILE_SIZE);
                    ctx.strokeRect(x * TILE_SIZE, y * TILE_SIZE, TILE_SIZE, TILE_SIZE);

                    // Add "Tech" details to walls randomly
                    if ((x + y) % 3 === 0) {
                        ctx.fillStyle = '#111';
                        ctx.fillRect(x * TILE_SIZE + 10, y * TILE_SIZE + 10, TILE_SIZE - 20, TILE_SIZE - 20);
                        ctx.fillStyle = COLORS.bg;
                    }
                }
            }
        }
    }

    // Draw Loot
    entities.forEach(e => {
        if (e.type === 'loot') {
            const bob = Math.sin(Date.now() / 200 + e.bobOffset) * 3;
            ctx.fillStyle = e.kind === 'ammo' ? COLORS.neonCyan : COLORS.neonGreen;
            ctx.strokeStyle = '#fff';
            ctx.beginPath();
            ctx.arc(e.x, e.y + bob, e.radius, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();

            // Label
            ctx.fillStyle = '#fff';
            ctx.font = '10px monospace';
            ctx.fillText(e.kind.toUpperCase(), e.x - 10, e.y - 10 + bob);
        }
    });

    // Draw Enemies
    entities.forEach(e => {
        if (e.type === 'enemy') {
            ctx.fillStyle = COLORS.enemy;
            ctx.beginPath();
            ctx.arc(e.x, e.y, e.radius, 0, Math.PI * 2);
            ctx.fill();

            // Eyes
            ctx.fillStyle = '#fff';
            ctx.fillRect(e.x - 4, e.y - 4, 3, 3);
            ctx.fillRect(e.x + 1, e.y - 4, 3, 3);
        }
    });

    // Draw Bullets
    entities.forEach(e => {
        if (e.type === 'bullet') {
            ctx.strokeStyle = COLORS.bullet;
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(e.x, e.y);
            ctx.lineTo(e.x - e.vx, e.y - e.vy); // Trail
            ctx.stroke();
        }
    });

    // Draw Particles
    entities.forEach(e => {
        if (e.type === 'particle') {
            ctx.fillStyle = e.color;
            ctx.globalAlpha = e.life / 20;
            ctx.fillRect(e.x, e.y, 2, 2);
            ctx.globalAlpha = 1;
        }
    });

    // Draw Player
    ctx.translate(player.x, player.y);
    ctx.rotate(player.angle);

    // Body
    ctx.fillStyle = COLORS.player;
    ctx.fillRect(-8, -8, 16, 16);

    // Gun
    ctx.fillStyle = '#444';
    ctx.fillRect(0, 2, 20, 4);

    ctx.rotate(-player.angle);
    ctx.translate(-player.x, -player.y);

    // Restore clip
    ctx.restore();

    // 4. Draw Fog of War Gradient over the clipped edge (optional polish)
    // To make the transition softer, we could draw a radial gradient on top
    const grad = ctx.createRadialGradient(player.x, player.y, FOV_RADIUS * 0.8, player.x, player.y, FOV_RADIUS);
    grad.addColorStop(0, 'rgba(0,0,0,0)');
    grad.addColorStop(1, 'rgba(5,5,5,1)');
    ctx.fillStyle = grad;
    ctx.translate(camera.x, camera.y); // Cancel camera for full screen fill? No.
    // Actually, just filling the rect around player is enough
    ctx.fillRect(player.x - FOV_RADIUS, player.y - FOV_RADIUS, FOV_RADIUS * 2, FOV_RADIUS * 2);

    // Restore camera
    ctx.restore();

    // 5. UI Crosshair
    ctx.strokeStyle = COLORS.player;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(mouse.x - 10, mouse.y);
    ctx.lineTo(mouse.x + 10, mouse.y);
    ctx.moveTo(mouse.x, mouse.y - 10);
    ctx.lineTo(mouse.x, mouse.y + 10);
    ctx.stroke();

    // Laser Sight Line (fades out)
    // Can calculate ray from player to mouse, clipped by walls for realism?
    // For now just a faint line
    ctx.strokeStyle = 'rgba(0, 255, 0, 0.2)';
    ctx.beginPath();
    ctx.moveTo(width / 2, height / 2);
    ctx.lineTo(mouse.x, mouse.y);
    ctx.stroke();

    requestAnimationFrame(loop);
}

function loop(timestamp) {
    const dt = timestamp - lastTime;
    lastTime = timestamp;
    update(dt);
    render();
}

// --- INIT ---
resize();
generateMap();
updateInventoryUI();
requestAnimationFrame(loop);
