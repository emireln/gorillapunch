var AudioContextCtor = window.AudioContext || window.webkitAudioContext,
	audio_ctx = AudioContextCtor ? new AudioContextCtor() : null,
	audio_master_gain = audio_ctx ? audio_ctx.createGain() : null,
	audio_volume = 0.65,
	audio_muted = false,
	audio_sfx_shoot,
	audio_sfx_hit,
	audio_sfx_hurt,
	audio_sfx_beep,
	audio_sfx_pickup,
	audio_sfx_terminal,
	audio_sfx_explode;

if (audio_master_gain) {
	audio_master_gain.gain.value = audio_volume;
	audio_master_gain.connect(audio_ctx.destination);
}

function audio_set_volume(value) {
	audio_volume = Math.max(0, Math.min(1, Number(value) || 0));
	audio_update_gain();
}

function audio_set_muted(value) {
	audio_muted = !!value;
	audio_update_gain();
}

function audio_update_gain() {
	if (audio_master_gain && audio_ctx) {
		audio_master_gain.gain.setTargetAtTime(audio_muted ? 0 : audio_volume, audio_ctx.currentTime, 0.025);
	}
}

function audio_init(callback) {
	if (!audio_ctx) { callback && callback(); return; }
	sonantxr_generate_song(audio_ctx, music_dark_meat_beat, function(buffer){
		audio_play(buffer, true);
		callback();
	});
	sonantxr_generate_sound(audio_ctx, sound_shoot, 140, function(buffer){
		audio_sfx_shoot = buffer;
	});
	sonantxr_generate_sound(audio_ctx, sound_hit, 134, function(buffer){
		audio_sfx_hit = buffer;
	});
	sonantxr_generate_sound(audio_ctx, sound_beep, 173, function(buffer){
		audio_sfx_beep = buffer;
	});
	sonantxr_generate_sound(audio_ctx, sound_hurt, 144, function(buffer){
		audio_sfx_hurt = buffer;
	});
	sonantxr_generate_sound(audio_ctx, sound_pickup, 156, function(buffer){
		audio_sfx_pickup = buffer;
	});
	sonantxr_generate_sound(audio_ctx, sound_terminal, 156, function(buffer){
		audio_sfx_terminal = buffer;
	});
	sonantxr_generate_sound(audio_ctx, sound_explode, 114, function(buffer){
		audio_sfx_explode = buffer;
	});
};

function audio_play(buffer, loop) {
	if (!buffer || !audio_ctx) return;
	var source = audio_ctx.createBufferSource();
	source.buffer = buffer;
	source.loop = loop;
	source.connect(audio_master_gain || audio_ctx.destination);
	source.start();
};
