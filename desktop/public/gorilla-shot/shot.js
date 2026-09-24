// Gorilla Shot adapts Underrun's arena, entities, and renderer for the desktop app.
// Progress messages contain only game statistics; account data stays in Electron.
var shot_palette = {
	background: [0.141176, 0.125490, 0.168627],
	ambient: [0.709804, 0.690196, 0.741176],
	purple: [0.458824, 0.325490, 1],
	red: [0.898039, 0.282353, 0.301961]
};
var shot_locale = 'en';
var shot_strings = {
	en: {
		game: 'Gorilla Shot', intro: 'Restore the satellite systems, survive the arena, and clear each sector.', deploy: 'Deploy to Sector {level}',
		move: 'MOVE', aim: 'AIM', fire: 'FIRE', pause: 'PAUSE', ready: 'READY', loading: 'Loading game systems…', loadingTitle: 'PREPARING THE ARENA', loadingStep: 'Loading textures and building the sector…', loadingError: 'The arena could not be loaded. Check your graphics support and try again.',
		preparing: 'Preparing the arena…', noWebgl: 'WebGL is unavailable on this device.', tryAgain: 'Try again', secured: 'SECTORS SECURED', ended: 'RUN ENDED',
		cleared: 'All systems are back online. Your run is saved.', failed: 'The mission is over. Your progress is saved.', deployAgain: 'Deploy again',
		paused: 'PAUSED', pausedMessage: 'The clock is stopped. Take a breath.', resume: 'Resume mission', couldNotStart: 'Could not start the mission.',
		reboot: 'REBOOTING...', success: 'SUCCESS', systemsOffline: 'SYSTEM(S) STILL OFFLINE', allOnline: 'ALL SYSTEMS ONLINE', triangulating: 'TRIANGULATING POSITION FOR NEXT HOP...', target: 'TARGET ACQUIRED', jumping: 'JUMPING...', scan: 'SCANNING FOR OFFLINE SYSTEMS...___'
	},
	'pt-BR': {
		game: 'Gorilla Shot', intro: 'Restaure os sistemas do satélite, sobreviva à arena e conclua cada setor.', deploy: 'Avançar para o setor {level}',
		move: 'MOVER', aim: 'MIRAR', fire: 'ATIRAR', pause: 'PAUSAR', ready: 'PRONTO', loading: 'Carregando os sistemas do jogo…', loadingTitle: 'PREPARANDO A ARENA', loadingStep: 'Carregando texturas e montando o setor…', loadingError: 'Não foi possível carregar a arena. Verifique o suporte gráfico e tente novamente.',
		preparing: 'Preparando a arena…', noWebgl: 'WebGL não está disponível neste dispositivo.', tryAgain: 'Tentar novamente', secured: 'SETORES CONCLUÍDOS', ended: 'PARTIDA ENCERRADA',
		cleared: 'Todos os sistemas estão online. Sua partida foi salva.', failed: 'A missão terminou. Seu progresso foi salvo.', deployAgain: 'Jogar novamente',
		paused: 'PAUSADO', pausedMessage: 'O tempo parou. Respire um pouco.', resume: 'Retomar missão', couldNotStart: 'Não foi possível iniciar a missão.',
		reboot: 'REINICIANDO...', success: 'SUCESSO', systemsOffline: 'SISTEMA(S) AINDA OFFLINE', allOnline: 'TODOS OS SISTEMAS ONLINE', triangulating: 'TRIANGULANDO POSIÇÃO PARA O PRÓXIMO SALTO...', target: 'ALVO LOCALIZADO', jumping: 'SALTANDO...', scan: 'PROCURANDO SISTEMAS OFFLINE...___',
		story: 'DATA: 13 SET. 2718 - 13:32\nFALHA CRÍTICA DE SOFTWARE DETECTADA\nANALISANDO...\n____\n \nCÓDIGO DO ERRO: JS13K2018\nSTATUS: SISTEMAS OFFLINE\nDESCRIÇÃO: FALHA DE BUFFER CAUSADA POR R.U.D. VIA SATÉLITE\nSISTEMA AFETADO: AUTOMAÇÃO DA INSTALAÇÃO\nSUBSISTEMAS AFETADOS: IA, ESCUDOS DE RADIAÇÃO, ENERGIA\n \nINICIANDO SISTEMA DE RESGATE...\n___FALHOU\n \nTENTANDO REINICIALIZAÇÃO AUTOMÁTICA...\n___FALHOU\n_ \n \nREINICIALIZAÇÃO MANUAL DE TODOS OS SISTEMAS NECESSÁRIA\n_ \nUSE WASD OU AS SETAS PARA MOVER, MOUSE PARA ATIRAR\nCLIQUE PARA INICIAR A MISSÃO\n '
	}
};
function shot_t(key, values) {
	var text = shot_strings[shot_locale][key] || shot_strings.en[key] || key;
	Object.keys(values || {}).forEach(function(name) { text = text.replace('{' + name + '}', values[name]); });
	return text;
}
window.shot_t = shot_t;
var shot = {
	active: false,
	paused: false,
	waiting: false,
	ready: false,
	loopStarted: false,
	preloading: false,
	previewLevel: 0,
	previewRequest: 0,
	audioStarted: false,
	muted: false,
	volume: 0.65,
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
var shot_loading = document.getElementById('shot-loading');
var shot_loading_title = document.getElementById('shot-loading-title');
var shot_loading_step = document.getElementById('shot-loading-step');
var shot_loading_progress = document.getElementById('shot-loading-progress');
var shot_fire_key = document.getElementById('shot-fire-key');
var shot_controls = {
	move: document.getElementById('shot-move-label'),
	aim: document.getElementById('shot-aim-label'),
	fire: document.getElementById('shot-fire-label'),
	pause: document.getElementById('shot-pause-label')
};

function shot_apply_locale() {
	document.documentElement.lang = shot_locale;
	if (!shot.active && !shot.waiting) {
		shot_heading.textContent = shot_t('game');
		shot_message.textContent = shot_t('intro');
		shot_start.textContent = shot_t('deploy', { level: shot.selectedLevel });
		Object.keys(shot_controls).forEach(function(key) { shot_controls[key].textContent = shot_t(key); });
		shot_fire_key.textContent = shot_locale === 'pt-BR' ? 'CLIQUE E SEGURE' : 'HOLD CLICK';
	}
	shot_loading_title.textContent = shot_t('loadingTitle');
	if (!shot.ready) shot_loading_step.textContent = shot_t('loadingStep');
}

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
	shot_locale = detail.locale === 'pt-BR' ? 'pt-BR' : 'en';
	shot_apply_locale();
	var previousLevel = shot.selectedLevel;
	if (Number.isInteger(detail.level)) shot.selectedLevel = Math.max(1, Math.min(3, detail.level));
	var colors = detail.colors || {};
	var names = ['bg', 'surface', 'overlay', 'purple', 'purple-light', 'red', 'text', 'muted', 'ambient'];
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
	if (!shot.active && !shot.waiting) shot_start.textContent = shot_t('deploy', { level: shot.selectedLevel });
	shot_start.disabled = (!shot.ready && !shot.loadingFailed) || shot.waiting;
	if (shot.ready && !shot.active && !shot.waiting && previousLevel !== shot.selectedLevel) shot_prepare_preview(shot.selectedLevel);
}

function shot_set_loading(show, title, step, progress) {
	shot_loading.hidden = !show;
	if (title) shot_loading_title.textContent = title;
	if (step) shot_loading_step.textContent = step;
	if (typeof progress === 'number') shot_loading_progress.style.width = Math.max(0, Math.min(100, progress)) + '%';
}

function shot_show_overlay(heading, message, button) {
	shot_heading.textContent = heading;
	shot_message.textContent = message;
	shot_start.textContent = button;
	shot_start.disabled = (!shot.ready && !shot.loadingFailed) || shot.waiting;
	shot_loading.hidden = true;
	shot_overlay.hidden = false;
}

function shot_fail(message) {
	shot.waiting = false;
	if (!shot.ready) shot.loadingFailed = true;
	shot_show_overlay(shot_t('game'), message, shot_t('tryAgain'));
	shot_send('error', { message: message });
}

function shot_render_preview() {
	if (!gl || !shot.ready || !entity_player) return;
	renderer_prepare_frame();
	for (var i = 0; i < entities.length; i++) {
		if (!entities[i]._dead) entities[i]._render();
	}
	for (var health = 0; health < entity_player.h; health++) push_sprite(-camera_x - 50 + health * 4, 29 - camera_y, -camera_z - 30, 26);
	renderer_end_frame();
}

function shot_prepare_preview(level) {
	if (!shot.ready || shot.active || shot.waiting) return;
	var request = ++shot.previewRequest;
	level = Math.max(1, Math.min(3, Number(level) || 1));
	current_level = level - 1;
	load_level(level, function() {
		if (request !== shot.previewRequest || shot.active || shot.waiting) return;
		shot.previewLevel = level;
		shot_render_preview();
		shot_overlay.hidden = false;
		shot_loading.hidden = true;
	});
}

function shot_preload_assets() {
	if (shot.preloading || shot.ready) return;
	shot.preloading = true;
	shot_set_loading(true, shot_t('loadingTitle'), shot_t('loadingStep'), 0);
	if (!gl) {
		shot.preloading = false;
		shot_set_loading(false);
		shot_fail(shot_t('noWebgl'));
		shot_send('loaded');
		return;
	}
	var assets = ['q2', 'l1', 'l2', 'l3'];
	var index = 0;
	function fail() {
		shot.preloading = false;
		shot_set_loading(false);
		shot_fail(shot_t('loadingError'));
		shot_send('loaded');
	}
	function loadNext() {
		if (index >= assets.length) {
			try {
				renderer_init();
				renderer_bind_image(shot_image_cache.q2);
				shot.ready = true;
				shot.loadingFailed = false;
				shot.preloading = false;
				shot_start.disabled = false;
				shot_prepare_preview(shot.selectedLevel);
				shot_send('loaded');
			} catch (error) {
				fail(error);
			}
			return;
		}
		var name = assets[index++];
		load_image(name, function() {
			shot_set_loading(true, shot_t('loadingTitle'), shot_t('loadingStep'), index / assets.length * 75);
			loadNext();
		}, fail);
	}
	loadNext();
}

function shot_begin(runId, level, startedAt) {
	if (shot.active || typeof runId !== 'string' || !/^[0-9a-f-]{36}$/i.test(runId)) return;
	if (!gl || !shot.ready) { shot_fail(shot_t('noWebgl')); return; }
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
	shot_set_loading(true, shot_t('loadingTitle'), shot_t('preparing'), 90);
	shot.firstFrame = false;
	current_level = shot.startLevel - 1;
	var load = function() {
		next_level(function() {
			time_last = performance.now();
			shot_publish('state');
			if (!shot.loopStarted) { shot.loopStarted = true; requestAnimationFrame(game_tick); }
		});
	};
	load();
}

function shot_finish(outcome) {
	if (!shot.active) return;
	shot.active = false;
	shot.paused = false;
	shot.waiting = false;
	terminal_cancel();
	keys[key_up] = keys[key_down] = keys[key_left] = keys[key_right] = keys[key_shoot] = 0;
	if (audio_ctx) void audio_ctx.suspend();
	shot_publish('end', { outcome: outcome });
	shot_show_overlay(
		outcome === 'cleared' ? shot_t('secured') : shot_t('ended'),
		outcome === 'cleared' ? shot_t('cleared') : shot_t('failed'),
		shot_t('deployAgain')
	);
}

function shot_pause(paused) {
	if (!shot.active || shot.paused === paused) return;
	shot.paused = paused;
	keys[key_up] = keys[key_down] = keys[key_left] = keys[key_right] = keys[key_shoot] = 0;
	time_last = performance.now();
	if (paused) {
		if (audio_ctx) void audio_ctx.suspend();
		shot_show_overlay(shot_t('paused'), shot_t('pausedMessage'), shot_t('resume'));
	} else {
		shot_overlay.hidden = true;
		if (!shot.muted && shot.volume > 0 && audio_ctx) void audio_ctx.resume();
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
	if (!shot.firstFrame) {
		shot.firstFrame = true;
		shot_set_loading(false, null, null, 100);
	}
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
	if (!shot.ready) { shot.loadingFailed = false; shot_preload_assets(); return; }
	shot.waiting = true;
	shot_start.disabled = true;
	shot_overlay.hidden = true;
	shot_set_loading(true, shot_t('loadingTitle'), shot_t('preparing'), 85);
	if (audio_ctx) void audio_ctx.resume();
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
	if (event.data.type === 'audio') {
		shot.muted = !!detail.muted;
		if (Number.isFinite(detail.volume)) shot.volume = Math.max(0, Math.min(1, detail.volume));
		audio_set_volume(shot.volume);
		audio_set_muted(shot.muted);
		if (shot.active && !shot.paused && !shot.muted && shot.volume > 0 && audio_ctx) void audio_ctx.resume();
	}
	if (event.data.type === 'input') {
		var code = String(detail.code || '');
		var inputKey = { KeyA: key_left, ArrowLeft: key_left, KeyW: key_up, ArrowUp: key_up, KeyD: key_right, ArrowRight: key_right, KeyS: key_down, ArrowDown: key_down }[code];
		if (inputKey !== undefined) keys[inputKey] = detail.pressed ? 1 : 0;
		if (detail.pressed && !detail.repeat && (code === 'KeyP' || code === 'Escape')) shot_pause(!shot.paused);
	}
	if (event.data.type === 'error') shot_fail(String(detail.message || shot_t('couldNotStart')));
});

window.addEventListener('blur', function() {
	keys[key_up] = keys[key_down] = keys[key_left] = keys[key_right] = keys[key_shoot] = 0;
});

document.addEventListener('keydown', function(event) {
	if (event.code === 'KeyP' || event.code === 'Escape') {
		event.preventDefault();
		if (event.repeat) return;
		shot_pause(!shot.paused);
	}
});
document.addEventListener('visibilitychange', function() { if (document.hidden) shot_pause(true); });
shot_start.disabled = true;
shot_send('ready');
shot_preload_assets();
