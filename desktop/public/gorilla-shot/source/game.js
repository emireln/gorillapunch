
var udef, // global undefined
	_math = Math,
	_document = document,
	_temp,
	shot_image_cache = {},

	keys = {37: 0, 38: 0, 39: 0, 40: 0},
	key_up = 38, key_down = 40, key_left = 37, key_right = 39, key_shoot = 512,
	key_convert = {65: 37, 87: 38, 68: 39, 83: 40}, // convert AWDS to left up down right
	mouse_x = 0, mouse_y = 0,

	time_elapsed,
	time_last = performance.now(),
	
	level_width = 64,
	level_height = 64,
	level_data = new Uint8Array(level_width * level_height),

	cpus_total = 0,
	cpus_rebooted = 0,

	current_level = 0,
	shot_map_variant = 0,
	level_request = 0,
	entity_player,
	entities = [],
	entities_to_kill = [];

function load_image(name, callback, onerror) {
	var image = shot_image_cache[name];
	if (image && image.complete && image.naturalWidth > 0) {
		_temp = image;
		callback && callback.call(image);
		return image;
	}
	if (!image || (image.complete && image.naturalWidth === 0)) {
		image = shot_image_cache[name] = new Image();
	}
	_temp = image;
	if (callback) image.addEventListener('load', function(){ callback.call(image); }, { once: true });
	if (onerror) image.addEventListener('error', function(){ delete shot_image_cache[name]; onerror.call(image); }, { once: true });
	image.src = image.src || 'm/'+name+'.png';
	return image;
}

function next_level(callback) {
	if (current_level == 3) {
		entities_to_kill.push(entity_player);
		terminal_run_outro();
	}
	else {
		current_level++;
		load_level(current_level, callback);
		
	}
}

function load_level(id, callback) {
	var request = ++level_request;
	random_seed(0xBADC0DE1 + id + shot_map_variant * 0x10001);
	if (shot_map_variant > 0) {
		build_level(id, generated_level(id, shot_map_variant), callback);
		return;
	}
	load_image('l'+id, function(){
		if (request !== level_request) return;
		var pixels = _document.createElement('canvas');
		pixels.width = pixels.height = level_width;
		var context = pixels.getContext('2d');
		context.drawImage(this, 0, 0);
		var image_data = context.getImageData(0, 0, level_width, level_height).data;
		var colors = new Uint16Array(level_width * level_height);
		for (var index = 0; index < colors.length; index++) {
			colors[index] = ((image_data[index*4]>>4) << 8) + ((image_data[index*4+1]>>4) << 4) + (image_data[index*4+2]>>4);
		}
		build_level(id, colors, callback);
	});
}

// Two connected room layouts supplement each original sector map. The same
// layout choice carries across sectors, while room sizes vary with the sector.
function generated_level(id, variant) {
	var pixels = new Uint16Array(level_width * level_height);
	var rooms = variant === 1
		? [[11,11],[31,11],[51,11],[11,31],[31,31],[51,31],[11,51],[31,51],[51,51]]
		: [[12,12],[31,12],[51,12],[51,31],[51,51],[31,51],[12,51],[12,31],[31,31]];
	function floor(x, y) { if (x > 1 && y > 1 && x < 62 && y < 62) pixels[y * level_width + x] = 0xfff; }
	function corridor(a, b) {
		for (var x = Math.min(a[0], b[0]); x <= Math.max(a[0], b[0]); x++) for (var dy = -1; dy <= 1; dy++) floor(x, a[1] + dy);
		for (var y = Math.min(a[1], b[1]); y <= Math.max(a[1], b[1]); y++) for (var dx = -1; dx <= 1; dx++) floor(b[0] + dx, y);
	}
	for (var i = 0; i < rooms.length; i++) {
		var room = rooms[i];
		var radius = 4 + (id + i) % 3;
		for (var ry = -radius; ry <= radius; ry++) for (var rx = -radius; rx <= radius; rx++) floor(room[0] + rx, room[1] + ry);
	}
	if (variant === 1) {
		for (var row = 0; row < 3; row++) for (var col = 0; col < 2; col++) corridor(rooms[row * 3 + col], rooms[row * 3 + col + 1]);
		for (var col = 0; col < 3; col++) for (var row = 0; row < 2; row++) corridor(rooms[row * 3 + col], rooms[(row + 1) * 3 + col]);
	} else {
		for (var ring = 0; ring < 8; ring++) corridor(rooms[ring], rooms[(ring + 1) % 8]);
		corridor(rooms[1], rooms[8]);
		corridor(rooms[8], rooms[5]);
	}
	var floors = pixels.slice();
	for (var y = 1; y < 63; y++) for (var x = 1; x < 63; x++) {
		var index = y * level_width + x;
		if (floors[index]) continue;
		for (var oy = -1; oy <= 1; oy++) for (var ox = -1; ox <= 1; ox++) {
			if (floors[(y + oy) * level_width + x + ox]) pixels[index] = 0x888;
		}
	}
	var player_room = variant === 1 ? 4 : 0;
	for (var i = 0; i < rooms.length; i++) {
		var point = rooms[i];
		pixels[point[1] * level_width + point[0]] = i === player_room ? 0x0f0 : (i === 2 || i === 6) ? 0xf00 : 0x00f;
	}
	return pixels;
}

function build_level(id, colors, callback) {
		entities = [];
		level_data.fill(0);
		num_verts = 0;
		num_lights = 0;

		cpus_total = 0;
		cpus_rebooted = 0;

		for (var y = 0, index = 0; y < level_height; y++) {
			for (var x = 0; x < level_width; x++, index++) {
				var color_key = colors[index];

				if (color_key !== 0) {
					var tile = level_data[index] =
						color_key === 0x888 // wall
								? random_int(0,5) < 4 ? 8 : random_int(8, 17)
								: array_rand([1,1,1,1,1,3,3,2,5,5,5,5,5,5,7,7,6]); // floor


					if (tile > 7) { // walls
						push_block(x * 8, y * 8, 4, tile-1);
					}
					else if (tile > 0) { // floor
						push_floor(x * 8, y * 8, tile-1);

						// enemies and items
						if (random_int(0, 16 - (id * 2)) == 0) {
							new entity_spider_t(x*8, 0, y*8, 5, 27);
						}
						else if (random_int(0, 100) == 0) {
							new entity_health_t(x*8, 0, y*8, 5, 31);
						}
					}

					// cpu
					if (color_key === 0x00f) {
						level_data[index] = 8;
						new entity_cpu_t(x*8, 0, y*8, 0, 18);
						cpus_total++;
					}

					// sentry
					if (color_key === 0xf00) {
						new entity_sentry_t(x*8, 0, y*8, 5, 32);
					}

					// player start position (blue)
					if (color_key === 0x0f0) {
						entity_player = new entity_player_t(x*8, 0, y*8, 5, 18);	
					}
				}
			}
		}

		// Remove all spiders that spawned close to the player start
		for (var i = 0; i < entities.length; i++) {
			var e = entities[i];
			if (
				e instanceof(entity_spider_t) &&
				_math.abs(e.x - entity_player.x) < 64 &&
				_math.abs(e.z - entity_player.z) < 64
			) {
				entities_to_kill.push(e);
			}
		}

		camera_x = -entity_player.x;
		camera_y = -300;
		camera_z = -entity_player.z - 88;

		level_num_verts = num_verts;

		var scanMessage = window.shot_t ? window.shot_t('scan') : 'SCANNING FOR OFFLINE SYSTEMS...___';
		terminal_show_notice(
			scanMessage +
			(cpus_total)+' SYSTEMS FOUND'
		);
		callback && callback();
}

function reload_level() {
	load_level(current_level);
}

function preventDefault(ev) {
	ev.preventDefault();
}

_document.onkeydown = function(ev){
	_temp = ev.keyCode;
	_temp = key_convert[_temp] || _temp;
	if (keys[_temp] !== udef) {
		keys[_temp] = 1;
		preventDefault(ev);
	}
}

_document.onkeyup = function(ev) {
	_temp = ev.keyCode;
	_temp = key_convert[_temp] || _temp;
	if (keys[_temp] !== udef) {
		keys[_temp] = 0;
		preventDefault(ev);
	}
}

_document.onmousemove = function(ev) {
	var bounds = c.getBoundingClientRect();
	mouse_x = ((ev.clientX - bounds.left) / bounds.width) * c.width;
	mouse_y = ((ev.clientY - bounds.top) / bounds.height) * c.height;
}

_document.onmousedown = function(ev) {
	keys[key_shoot] = 1;
	preventDefault(ev);
}

_document.onmouseup = function(ev) {
	keys[key_shoot] = 0;
	preventDefault(ev);
}

function game_tick() {
	var time_now = performance.now();
	time_elapsed = (time_now - time_last)/1000;
	time_last = time_now;

	renderer_prepare_frame();

	// update and render entities
	for (var i = 0, e1, e2; i < entities.length; i++) {
		e1 = entities[i];
		if (e1._dead) { continue; }
		e1._update();

		// check for collisions between entities - it's quadratic and nobody cares \o/
		for (var j = i+1; j < entities.length; j++) {
			e2 = entities[j];
			if(!(
				e1.x >= e2.x + 9 ||
				e1.x + 9 <= e2.x ||
				e1.z >= e2.z + 9 ||
				e1.z + 9 <= e2.z
			)) {
				e1._check(e2);
				e2._check(e1);
			}
		}

		e1._render();		
	}

	// center camera on player, apply damping
	camera_x = camera_x * 0.92 - entity_player.x * 0.08;
	camera_y = camera_y * 0.92 - entity_player.y * 0.08;
	camera_z = camera_z * 0.92 - entity_player.z * 0.08;

	// add camera shake
	camera_shake *= 0.9;
	camera_x += camera_shake * (_math.random()-0.5);
	camera_z += camera_shake * (_math.random()-0.5);

	// health bar, render with plasma sprite
	for (var i = 0; i < entity_player.h; i++) {
		push_sprite(-camera_x - 50 + i * 4, 29-camera_y, -camera_z-30, 26);
	}

	renderer_end_frame();


	// remove dead entities
	entities = entities.filter(function(entity) {
		return entities_to_kill.indexOf(entity) === -1;
	});
	entities_to_kill = [];

	requestAnimationFrame(game_tick);
}
