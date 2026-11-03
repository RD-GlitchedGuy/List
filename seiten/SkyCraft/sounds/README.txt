SkyCraft MP3 sound slots

Replace the empty MP3 files in the game's sounds folder with your own audio.
Keep each filename unchanged. A random music track plays at a time, followed by a random 3-60 second silence; short effects play once.
The AI Music setting in Settings turns all music and sounds on or off.
For a built game, put extra tracks in sounds/ beside the game. Running npm run dev syncs them from sounds/ into src/public/sounds/.

menu_music.mp3       First main menu track
menu_music_2.mp3     Second main menu track (optional)
...
menu_music_5.mp3     Fifth main menu track (optional)
game_music.mp3       First in-game track
game_music_2.mp3     Second in-game track (optional)
...
game_music_40.mp3    Fortieth in-game track (optional)
button_press.mp3     Menu and interface button
walk_on_stone.mp3    Default footsteps when a block-specific sound is unavailable
walk_<block_name>.mp3  Footsteps for each block (for example walk_grass.mp3, walk_stone.mp3); use the exact block name from the game's block list. Missing files fall back to a material sound (walk_grass, walk_gravel, walk_sand, walk_wood, walk_wool) and then to walk_on_stone.mp3.
jump.mp3             Player jump
land.mp3             Player landing
block_break.mp3      Block mining and breaking
block_place.mp3      Placing a block
item_pickup.mp3      Picking up an item
item_drop.mp3        Dropping an item
player_damage.mp3    Player takes damage
mob_hit.mp3          Hitting a mob
chicken.mp3          Random chicken sounds and chicken hits
cow.mp3              Random cow sounds and cow hits
zombie.mp3           Random zombie sounds and zombie hits

If a sound file is missing or empty, the game now plays a built-in generated sound instead of staying silent.
IMPORTANT: the sounds folder must sit right next to index.html (same folder as game.js).
