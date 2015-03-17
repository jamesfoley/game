/*
 * 	James' Game Engine
 */

//	Define engine global
var engine = {};
engine.game_loop = null;
engine.start = function() {

    //	Start game loop
    this.game_loop = setInterval(function() {

        //	Call main engine function
        engine.main();

    }, 1);

}
engine.stop = function() {

    //	Stop loop
    clearInterval(this.game_loop);

}
engine.main = function() {

    //	Manage inputs
    engine.input.keyboard();

    //	Clear the screen
    engine.canvas.clear();

    //	Render background layer
    engine.zone.render_layer('background');

    //	Render players
    engine.zone.render_players();

    //	Render foreground layer
    engine.zone.render_layer('foreground');

}

//	Networking
engine.networking = {};
engine.networking.socket = null;
engine.networking.init = function(callback) {

    //	Connect to game server
    this.socket = io.connect('/');

    //	On socket connect...
    engine.networking.socket.on('connect', function() {

        //	Run callback function
        callback();

        //	Bind recieve zone
        engine.networking.socket.on('receive_zone', engine.networking.receive_zone);

        //	Bind player join
        engine.networking.socket.on('player_joined', engine.networking.player_joined);

        //	Bind player leave
        engine.networking.socket.on('player_leave', engine.networking.player_leave);

        //	Bind player leave
        engine.networking.socket.on('player_move', engine.networking.player_move);

        //	On disconnect
        engine.networking.socket.on('disconnect', function() {

            //	Remove listeners
            engine.networking.socket.removeListener('receive_zone', engine.networking.receive_zone);
            engine.networking.socket.removeListener('player_joined', engine.networking.player_joined);
            engine.networking.socket.removeListener('player_leave', engine.networking.player_leave);
            engine.networking.socket.removeListener('player_move', engine.networking.player_move);

            //	Stop game
            engine.stop();

            //	Clean up zone
            engine.zone.players = {};

            //	Show disconnected message
            engine.canvas.loading_screen('Disconnected')

        })

    });

}
engine.networking.receive_zone = function(data) {

    //	Send the data over to the zone loader
    engine.zone.load(data);

}
engine.networking.player_joined = function(player) {

    //	Add the player to the zone
    engine.player.add(player);

}
engine.networking.player_leave = function(player_id) {

    //	Remove the player from the zone
    engine.player.remove(player_id);

}
engine.networking.player_move = function(player, direction, source_x, source_y, destination_x, destination_y, rotate_only) {

    //	Move the player
    engine.player.move(player, direction, source_x, source_y, destination_x, destination_y, rotate_only);

}

//	Canvas
engine.canvas = {};
engine.canvas.width = null;
engine.canvas.height = null;
engine.canvas.context = null;
engine.canvas.background_color = '#000';
engine.canvas.font = "gamegirl_classicregular";
engine.canvas.transition_timer = null;
engine.canvas.transition_alpha = 0;
engine.canvas.init = function(callback) {

    //	Get canvas dimensions
    this.width = $('.game').width();
    this.height = $('.game').height();

    //	Get 2d context for rendering later
    this.context = $('.game')[0].getContext('2d');

    //	Run callback function
    callback();
}
engine.canvas.clear = function() {

    //	Clear screen with clearRect
    this.context.clearRect(0, 0, this.width, this.height);

    //	Draw background rect
    this.context.fillStyle = this.background_color;
    this.context.fillRect(0, 0, this.width, this.height);
}
engine.canvas.loading_screen = function(text) {

    //	Clear the screen
    this.clear();

    //	Print text in centre of screen
    this.context.fillStyle = "#FFF";
    this.context.font = '14px "' + this.font + '"';
    this.context.textAlign = 'center';
    this.context.fillText(text, this.width / 2, this.height / 2);
}

//	Screen
engine.screen = {
    x: 0,
    y: 0,
    x_offset: 0,
    y_offset: 0,
    screen_timer: null
};

//	Zone
engine.zone = {};
engine.zone.properties = null;
engine.zone.tileset = null;
engine.zone.layers = null;
engine.zone.players = {};
engine.zone.load = function(data) {

    //	Stop the engine
    engine.stop();

    //	Remove all players
    Object.keys(this.players).forEach(function(player_id) {
        engine.player.remove(player_id)
    })

    //	Load data into the zone from the server
    this.properties = data.properties;
    this.tileset = data.tileset;
    this.layers = data.layers;

    //	Reset screen
    engine.screen.x_offset = 0;
    engine.screen.y_offset = 0;

    //	Add players
    Object.keys(data.players).forEach(function(player_id) {
        engine.player.add(data.players[player_id]);
    })

    //	Load the tileset
    this.tileset.image = new Image();
    this.tileset.image.onload = function() {

        //	Start the engine
        engine.start();

    }
    this.tileset.image.src = '/static/img/engine/tile_sets/' + this.tileset.source;
}
//	Draws a zone tile
engine.zone.draw_tile = function(x, y, tile) {
    //	Check to see if we have a tile
    if (tile > 0) {

        //	Calculate the position of the tile inside the tileset
        var y_pos = Math.floor(tile / (engine.zone.tileset.width / engine.zone.properties.tilewidth));
        var x_pos = tile % (engine.zone.tileset.width / engine.zone.properties.tilewidth);

        //	Calculate the pixel position of the tile inside the tileset
        var source_x = (engine.zone.properties.tilewidth * x_pos) - engine.zone.properties.tilewidth;
        var source_y = engine.zone.properties.tilewidth * y_pos;

        //	Calculate the position on the canvas to render the tile
        var destination_x = x * engine.zone.properties.tilewidth + engine.screen.x_offset;
        var destination_y = y * engine.zone.properties.tilewidth + engine.screen.y_offset;

        //	Draw the tile on the canvas
        engine.canvas.context.drawImage(engine.zone.tileset.image,
            source_x,
            source_y,
            engine.zone.properties.tilewidth,
            engine.zone.properties.tilewidth,
            destination_x,
            destination_y,
            engine.zone.properties.tilewidth,
            engine.zone.properties.tilewidth);
    }else{

    }
}
engine.zone.render_layer = function(layer) {

    //	Render background layer
    var i, j;
    var mapX = 0;
    var mapY = 0;

    //	For every chunk of tiles - Y axis
    for (j = -1; j < (engine.canvas.height / engine.zone.properties.tilewidth) + 1; j++) {
        //	For each tile in the chunk - X axis
        for (i = -1; i < (engine.canvas.width / engine.zone.properties.tilewidth) + 1; i++) {
            //	Define the position in the viewport to render from
            mapX = i + engine.screen.x;
            mapY = j + engine.screen.y;

            //	Check to see if we have a tile at current X and Y, if not set as null
            var tile = (engine.zone.layers[layer].matrix[mapY] && engine.zone.layers[layer].matrix[mapY][mapX]) ? engine.zone.layers[layer].matrix[mapY][mapX] : {tile: 0};

            //	Request tile to be rendered
            this.draw_tile(i, j, tile.tile);
        }
    }

}
engine.zone.render_players = function() {

    //	Loop each player and render them on the canvas
    Object.keys(this.players).forEach(function(player_id) {

        //	Render player
        engine.player.render(engine.zone.players[player_id]);

    })

}

//	Input
engine.input = {};
engine.input.keys = {
    up: 38,
    down: 40,
    left: 37,
    right: 39
}
engine.input.states = {};
engine.input.init = function() {

    //	Bind keyboard inputs
    window.addEventListener('keydown', function(e) {
        engine.input.states[e.keyCode || e.which] = true;
    }, true);
    window.addEventListener('keyup', function(e) {
        engine.input.states[e.keyCode || e.which] = false;
    }, true);

}
engine.input.keyboard = function() {

    //	Handle directional movement
    if (engine.input.states[engine.input.keys['up']]) {
        this.send_movement('up');
    }
    if (engine.input.states[engine.input.keys['down']]) {
        this.send_movement('down');
    }
    if (engine.input.states[engine.input.keys['left']]) {
        this.send_movement('left');
    }
    if (engine.input.states[engine.input.keys['right']]) {
        this.send_movement('right');
    }
}
engine.input.send_movement = function(direction) {

    //	If we are already moving, don't send the movement
    if (engine.zone.players[engine.networking.socket.io.engine.id] &&
        engine.zone.players[engine.networking.socket.io.engine.id].moving === false) {

        //	Tell the engine the player is already moving
        engine.zone.players[engine.networking.socket.io.engine.id].moving = true;

        //	Send the movement to the server
        engine.networking.socket.emit('player_move', direction);
    }
}

//	Player
engine.player = {};
engine.player.sprites = {
    ash: {
        image: new Image(),
        loaded: false,
        source: 'ash.png',
        centre: [-16, -20],
        animations: {
            walk_up: [[112, 0], [128, 0], [112, 0], [144, 0]],
            walk_down: [[64, 0], [80, 0], [64, 0], [96, 0]],
            walk_left: [[32, 0], [48, 0]],
            walk_right: [[0, 0], [16, 0]]
        },
        speed: 175
    },
    kris: {
        image: new Image(),
        loaded: false,
        source: 'kris.png',
        centre: [-16, -20],
        animations: {
            walk_up: [[112, 0], [128, 0], [112, 0], [144, 0]],
            walk_down: [[64, 0], [80, 0], [64, 0], [96, 0]],
            walk_left: [[32, 0], [48, 0]],
            walk_right: [[0, 0], [16, 0]]
        },
        speed: 175
    },
    sam: {
        image: new Image(),
        loaded: false,
        source: 'sam.png',
        centre: [-16, -20],
        animations: {
            walk_up: [[112, 0], [128, 0], [112, 0], [144, 0]],
            walk_down: [[64, 0], [80, 0], [64, 0], [96, 0]],
            walk_left: [[32, 0], [48, 0]],
            walk_right: [[0, 0], [16, 0]]
        },
        speed: 175
    },
    tom: {
        image: new Image(),
        loaded: false,
        source: 'tom.png',
        centre: [-16, -20],
        animations: {
            walk_up: [[112, 0], [128, 0], [112, 0], [144, 0]],
            walk_down: [[64, 0], [80, 0], [64, 0], [96, 0]],
            walk_left: [[32, 0], [48, 0]],
            walk_right: [[0, 0], [16, 0]]
        },
        speed: 175
    },
    mitch: {
        image: new Image(),
        loaded: false,
        source: 'mitch.png',
        centre: [-16, -20],
        animations: {
            walk_up: [[112, 0], [128, 0], [112, 0], [144, 0]],
            walk_down: [[64, 0], [80, 0], [64, 0], [96, 0]],
            walk_left: [[32, 0], [48, 0]],
            walk_right: [[0, 0], [16, 0]]
        },
        speed: 175
    },

};
engine.player.init = function(callback) {

    //	Load the player sprites
    Object.keys(this.sprites).forEach(function(sprite) {

        //	Load sprite
        engine.player.sprites[sprite].image.onload = function() {
            engine.player.sprites[sprite].loaded = true;
        }
        engine.player.sprites[sprite].image.src = '/static/img/engine/character_sets/' + engine.player.sprites[sprite].source;

    })

    //	Wait for the sprites to load
    var sprite_wait = setInterval(function() {

        //	Loop sprites
        var sprites_loaded = Object.keys(engine.player.sprites).every(function(sprite) {
            return engine.player.sprites[sprite].loaded === true;
        });

        //	If loaded, kill the timer and call the callback
        if (sprites_loaded === true) {

            //	Kill the timer
            clearInterval(sprite_wait);

            //	Run callback
            callback();
        }

    }, 100);
}
engine.player.add = function(player) {

    //	Add player to zone
    engine.zone.players[player.id] = player;

    //	Inject some client side data into the player for animations
    engine.zone.players[player.id].x_offset = 0;
    engine.zone.players[player.id].y_offset = 0;
    engine.zone.players[player.id].animation_frame = 0;
    engine.zone.players[player.id].animating = false;
    engine.zone.players[player.id].animation_timer = null;

    engine.zone.players[player.id].movement_timer = null;

    //	If player is client, match screen with player position
    if (engine.networking.socket.io.engine.id == player.id) {
        engine.screen.x = player.x - 16
        engine.screen.y = player.y - 14
    }
}
engine.player.remove = function(player_id) {

    //	Remove player from zone
    if (engine.zone.players[player_id]) {
        clearInterval(engine.zone.players[player_id].movement_timer);
        clearInterval(engine.zone.players[player_id].animation_timer);
        delete engine.zone.players[player_id];
    }

}
engine.player.render = function(player) {

    //	Calculate players location
    var x = (player.x * engine.zone.properties.tilewidth) + engine.player.sprites[player.sprite].centre[0] + player.x_offset;
    var y = (player.y * engine.zone.properties.tilewidth) + engine.player.sprites[player.sprite].centre[1] + player.y_offset;

    //	Add screen offsets
    x = x - (engine.screen.x * engine.zone.properties.tilewidth) + engine.screen.x_offset;
    y = y - (engine.screen.y * engine.zone.properties.tilewidth) + engine.screen.y_offset;

    //	Render player on canvas
    engine.canvas.context.drawImage(engine.player.sprites[player.sprite].image,
        engine.player.sprites[player.sprite].animations[player.animation][player.animation_frame][0],
        engine.player.sprites[player.sprite].animations[player.animation][player.animation_frame][1],
        engine.zone.properties.tilewidth,
        engine.zone.properties.tilewidth,
        x,
        y,
        engine.zone.properties.tilewidth,
        engine.zone.properties.tilewidth);
}
engine.player.move = function(player, direction, source_x, source_y, destination_x, destination_y, rotate_only) {

    //  Check to see if the player exists
    if (engine.zone.players[player.id] == undefined){
        return
    }

    //	Fix the players position, we could have issues
    clearInterval(engine.zone.players[player.id].movement_timer);
    clearInterval(engine.zone.players[player.id].animation_timer);
    engine.zone.players[player.id].x = source_x;
    engine.zone.players[player.id].y = source_y;
    engine.zone.players[player.id].x_offset = 0;
    engine.zone.players[player.id].y_offset = 0;

    //	Set player animation, reset the frame afterwards if we are out of bounds
    engine.zone.players[player.id].animation = 'walk_' + direction;
    if ((engine.zone.players[player.id].animation_frame + 1) >= engine.player.sprites[engine.zone.players[player.id].sprite].animations[engine.zone.players[player.id].animation].length) {
        engine.zone.players[player.id].animation_frame = 0;
    }

    //	Make sure we're not just rotating
    if (rotate_only) {

        //	Prevent network spam
        setTimeout(function() {

            //	Tell the engine the player is no longer moving
            engine.zone.players[player.id].moving = false;

        }, 200);

    }
    else {

        //	Animate the player
        engine.zone.players[player.id].animation_timer = setInterval(function() {

            //	If the next frame doesn't exist, reset the animation
            if ((engine.zone.players[player.id].animation_frame + 1) >= engine.player.sprites[engine.zone.players[player.id].sprite].animations[engine.zone.players[player.id].animation].length) {
                engine.zone.players[player.id].animation_frame = 0;
            }
            else {
                engine.zone.players[player.id].animation_frame++;
            }

        }, (engine.player.sprites[engine.zone.players[player.id].sprite].speed / engine.zone.players[player.id].speed_modifier));

        //	Loop variables
        var pixels = engine.zone.properties.tilewidth;

        //	Loop the pixels with setInterval
        engine.zone.players[player.id].movement_timer = setInterval(function() {

            //	Remove pixels
            pixels--;

            //	Modify variables based on direction
            switch(direction){
                case 'up':
                    engine.zone.players[player.id].y_offset--;

                    //	If player is client, manipulate screen offset
                    if (engine.networking.socket.io.engine.id == player.id) {
                        engine.screen.y_offset++;
                    }

                    break;
                case 'down':
                    engine.zone.players[player.id].y_offset++;

                    //	If player is client, manipulate screen offset
                    if (engine.networking.socket.io.engine.id == player.id) {
                        engine.screen.y_offset--;
                    }

                    break;
                case 'left':
                    engine.zone.players[player.id].x_offset--;

                    //	If player is client, manipulate screen offset
                    if (engine.networking.socket.io.engine.id == player.id) {
                        engine.screen.x_offset++;
                    }

                    break;
                case 'right':
                    engine.zone.players[player.id].x_offset++;

                    //	If player is client, manipulate screen offset
                    if (engine.networking.socket.io.engine.id == player.id) {
                        engine.screen.x_offset--;
                    }

                    break;
            }

            //	If we run out of pixels to animate over, kill the timer
            if (pixels == 0) {

                //	Clear timers
                clearInterval(engine.zone.players[player.id].movement_timer);
                clearInterval(engine.zone.players[player.id].animation_timer);

                //	Tell the engine the player is no longer moving
                engine.zone.players[player.id].moving = false;

                //	Set player position and offsets
                engine.zone.players[player.id].x_offset = 0;
                engine.zone.players[player.id].y_offset = 0;
                engine.zone.players[player.id].x = destination_x;
                engine.zone.players[player.id].y = destination_y;

                //	If player is client, match screen with player position
                if (engine.networking.socket.io.engine.id == player.id) {
                    engine.screen.x = player.x - 16
                    engine.screen.y = player.y - 14
                    engine.screen.x_offset = 0;
                    engine.screen.y_offset = 0;
                }

            }

        }, engine.zone.players[player.id].speed / engine.zone.players[player.id].speed_modifier)

    }

}
