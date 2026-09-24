// Gorilla Shot adapts Underrun's arena, entities, and renderer for the desktop app.
// Progress messages contain only game statistics; account data stays in Electron.
var shot_palette = {
	background: [0, 0, 0],
	ambient: [0.47, 0.40, 0.67],
	purple: [1, 1, 1],
	red: [1, 1, 1]
};
var shot = {
	active: false,
	paused: false,
	waiting: false,
	ready: false,
	loopStarted: false,
	audioStarted: false,
	muted: false,
	selectedLevel: 1,
	runId: '',
	startedAt: '',
	elapsedMs: 0,
	score: 0,
	kills: 0,
	systems: 0,
	levelReached: 1,
	lastPublished: 0
};
var shot_overlay = document.getElementById('shot-overlay');
var shot_heading = document.getElementById('shot-heading');
var shot_message = document.getElementById('shot-message');
var shot_start = document.getElementById('shot-start');

function shot_send(type, detail) {
	window.parent.postMessage({ channel: 'gorilla-shot-frame', type: type, detail: detail || {} }, '*');
}

function shot_snapshot() {
	return {
		runId: shot.runId,
		startedAt: shot.startedAt,
		level: current_level || shot.selectedLevel,
		levelReached: shot.levelReached,
		health: entity_player && shot.active ? Math.max(0, entity_player.h) : 0,
		maxHealth: 5,
		systems: cpus_rebooted || 0,
		systemsTotal: cpus_total || 0,
		totalSystems: shot.systems,
		kills: shot.kills,
		score: shot.score,
		durationMs: Math.floor(shot.elapsedMs),
		status: shot.active ? (shot.paused ? 'paused' : 'running') : 'idle'
	};
}

function shot_publish(type, extra) {
	shot_send(type, Object.assign(shot_snapshot(), extra || {}));
}

function shot_color(value) {
	if (typeof value !== 'string' || !/^#[0-9a-f]{6}$/i.test(value)) return null;
	return [1, 3, 5].map(function(index) { return parseInt(value.slice(index, index + 2), 16) / 255; });
}

function shot_configure(detail) {
	if (!detail || typeof detail !== 'object') return;
	if (Number.isInteger(detail.level)) shot.selectedLevel = Math.max(1, Math.min(3, detail.level));
	var colors = detail.colors || {};
	var names = ['bg', 'surface', 'overlay', 'purple', 'purple-light', 'red', 'text', 'muted', 'glow', 'ambient'];
	for (var i = 0; i < names.length; i++) {
		var name = names[i];
		if (typeof colors[name] === 'string' && /^#[0-9a-f]{6}([0-9a-f]{2})?$/i.test(colors[name])) {
			document.documentElement.style.setProperty('--shot-' + name, colors[name]);
		}
	}
	shot_palette.background = shot_color(colors.bg) || shot_palette.background;
	shot_palette.ambient = shot_color(colors.ambient) || shot_palette.ambient;
	shot_palette.purple = shot_color(colors.purple) || shot_palette.purple;
	shot_palette.red = shot_color(colors.red) || shot_palette.red;
	if (!shot.active && !shot.waiting) shot_start.textContent = 'Deploy to Sector ' + shot.selectedLevel;
	shot_start.disabled = false;
}

function shot_show_overlay(heading, message, button) {
	shot_heading.textContent = heading;
	shot_message.textContent = message;
	shot_start.textContent = button;
	shot_start.disabled = false;
	shot_overlay.hidden = false;
}

function shot_fail(message) {
	shot.waiting = false;
	shot_show_overlay('GORILLA SHOT', message, 'Try again');
	shot_send('error', { message: message });
}

function shot_begin(runId, level, startedAt) {
	if (shot.active || typeof runId !== 'string' || !/^[0-9a-f-]{36}$/i.test(runId)) return;
	if (!gl) { shot_fail('WebGL is unavailable on this device.'); return; }
	shot.waiting = false;
	shot.startLevel = Math.max(1, Math.min(3, Number(level) || 1));
	shot.runId = runId;
	shot.startedAt = startedAt;
	shot.elapsedMs = 0;
	shot.score = 0;
	shot.kills = 0;
	shot.systems = 0;
	entities_to_kill = [];
	shot.levelReached = shot.startLevel;
	shot.active = true;
	shot.paused = false;
	shot_overlay.hidden = true;
	current_level = shot.startLevel - 1;
	var load = function() {
		next_level(function() {
			time_last = performance.now();
			shot_publish('state');
			if (!shot.loopStarted) { shot.loopStarted = true; requestAnimationFrame(game_tick); }
		});
	};
	if (shot.ready) load();
	else {
		renderer_init();
		load_image('q2', function() {
			renderer_bind_image(this);
			shot.ready = true;
			load();
		});
	}
}

function shot_finish(outcome) {
	if (!shot.active) return;
	shot.active = false;
	shot.paused = false;
	shot.waiting = false;
	terminal_cancel();
	keys[key_up] = keys[key_down] = keys[key_left] = keys[key_right] = keys[key_shoot] = 0;
	void audio_ctx.suspend();
	shot_publish('end', { outcome: outcome });
	shot_show_overlay(
		outcome === 'cleared' ? 'SECTORS SECURED' : 'RUN ENDED',
		outcome === 'cleared' ? 'All systems are back online. Your run is saved.' : 'The mission is over. Your progress is saved.',
		'Deploy again'
	);
}

function shot_pause(paused) {
	if (!shot.active || shot.paused === paused) return;
	shot.paused = paused;
	keys[key_up] = keys[key_down] = keys[key_left] = keys[key_right] = keys[key_shoot] = 0;
	time_last = performance.now();
	if (paused) {
		void audio_ctx.suspend();
		shot_show_overlay('PAUSED', 'The clock is stopped. Take a breath.', 'Resume mission');
	} else {
		shot_overlay.hidden = true;
		if (!shot.muted) void audio_ctx.resume();
	}
	shot_publish('state');
}

// The source game reloads a sector after death. A Gorilla Shot run ends there.
entity_player_t.prototype._kill = function() {
	if (this._dead) return;
	entity_t.prototype._kill.call(this);
	shot_finish('failed');
};

var shot_spider_kill = entity_spider_t.prototype._kill;
entity_spider_t.prototype._kill = function() {
	var first = !this._dead;
	shot_spider_kill.call(this);
	if (first && shot.active) { shot.kills++; shot.score += 100; }
};
var shot_sentry_kill = entity_sentry_t.prototype._kill;
entity_sentry_t.prototype._kill = function() {
	var first = !this._dead;
	shot_sentry_kill.call(this);
	if (first && shot.active) { shot.kills++; shot.score += 300; }
};
var shot_cpu_check = entity_cpu_t.prototype._check;
entity_cpu_t.prototype._check = function(other) {
	var before = cpus_rebooted;
	shot_cpu_check.call(this, other);
	if (shot.active && cpus_rebooted > before) {
		shot.systems += cpus_rebooted - before;
		shot.score += 250;
		if (cpus_rebooted === cpus_total) {
			shot.score += 1000;
			shot.levelReached = Math.max(shot.levelReached, Math.min(3, current_level + 1));
		}
		shot_publish('checkpoint');
	}
};

next_level = function(callback) {
	if (!shot.active) return;
	if (current_level >= 3) { shot_finish('cleared'); return; }
	current_level++;
	shot.levelReached = Math.max(shot.levelReached, current_level);
	load_level(current_level, function() {
		shot_publish('state');
		if (callback) callback();
	});
};

game_tick = function() {
	requestAnimationFrame(game_tick);
	var now = performance.now();
	if (!shot.active || shot.paused || !shot.ready) { time_last = now; return; }
	var delta = Math.max(0, now - time_last);
	time_elapsed = Math.min(delta, 40) / 1000;
	shot.elapsedMs += Math.min(delta, 250);
	time_last = now;
	renderer_prepare_frame();
	for (var i = 0, e1, e2; i < entities.length; i++) {
		e1 = entities[i];
		if (e1._dead) continue;
		e1._update();
		for (var j = i + 1; j < entities.length; j++) {
			e2 = entities[j];
			if (!(e1.x >= e2.x + 9 || e1.x + 9 <= e2.x || e1.z >= e2.z + 9 || e1.z + 9 <= e2.z)) {
				e1._check(e2);
				e2._check(e1);
			}
		}
		e1._render();
		if (!shot.active) break;
	}
	if (!shot.active) return;
	camera_x = camera_x * 0.92 - entity_player.x * 0.08;
	camera_y = camera_y * 0.92 - entity_player.y * 0.08;
	camera_z = camera_z * 0.92 - entity_player.z * 0.08;
	camera_shake *= 0.9;
	camera_x += camera_shake * (_math.random() - 0.5);
	camera_z += camera_shake * (_math.random() - 0.5);
	renderer_end_frame();
	entities = entities.filter(function(entity) { return entities_to_kill.indexOf(entity) === -1; });
	entities_to_kill = [];
	if (now - shot.lastPublished >= 250) {
		shot.lastPublished = now;
		shot_publish('state');
	}
};

shot_start.addEventListener('click', function() {
	if (shot.paused) { shot_pause(false); return; }
	if (shot.active || shot.waiting) return;
	shot.waiting = true;
	shot_start.disabled = true;
	shot_message.textContent = 'Preparing the arena…';
	void audio_ctx.resume();
	if (!shot.audioStarted) { shot.audioStarted = true; audio_init(function() {}); }
	shot_send('start-request', { level: shot.selectedLevel });
});

window.addEventListener('message', function(event) {
	if (event.source !== window.parent || !event.data || event.data.channel !== 'gorilla-shot-host') return;
	var detail = event.data.detail || {};
	if (event.data.type === 'configure') shot_configure(detail);
	if (event.data.type === 'start') shot_begin(detail.runId, detail.level, detail.startedAt);
	if (event.data.type === 'pause') shot_pause(true);
	if (event.data.type === 'resume') shot_pause(false);
	if (event.data.type === 'mute') {
		shot.muted = !!detail.muted;
		if (shot.muted) void audio_ctx.suspend();
		else if (shot.active && !shot.paused) void audio_ctx.resume();
	}
	if (event.data.type === 'error') shot_fail(String(detail.message || 'Could not start the mission.'));
});

document.addEventListener('keydown', function(event) {
	if (event.code === 'KeyP' || event.code === 'Escape') {
		event.preventDefault();
		shot_pause(!shot.paused);
	}
});
window.addEventListener('blur', function() { shot_pause(true); });
document.addEventListener('visibilitychange', function() { if (document.hidden) shot_pause(true); });
shot_start.disabled = true;
shot_send('ready');
