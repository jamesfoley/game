//	Modules
var express = require('express'),
    http = require('http'),
    swig = require('swig'),
    fs = require('fs'),
    xml2js = require('xml2js');

//	Init modules
var app = express();
var server = app.listen(8082);
var io = require('socket.io').listen(server);

//	Socket.io configuration

//	Express configuration
app.configure(function() {
    swig.setDefaults({cache: false});
    app.engine('html', swig.renderFile);
    app.set('view engine', 'html');
    app.use(express.logger('dev'));
    app.use(express.static(__dirname + '/public'));
    app.use(express.errorHandler());
});

//	Server game index
app.get('/', function(req, res) {
    res.render('index', {title: 'Express'});
});

//	Store zones by name
var zones = {};

//	Loop zones and load them
function load_zone(zone, callback) {

    //	Check zone loaded
    if (zones[zone]) {

        //	Run callback
        if (callback) {
            callback();
        }

        return true;
    }

    //	Set zone file
    var zone_file = __dirname + '/zones/' + zone + '.tmx';

    //	Load the zone XML
    var parser = new xml2js.Parser();
    fs.readFile(zone_file, function(err, data) {

        //	Parse XML
        parser.parseString(data, function(err, result) {

            //	Load zone properties
            var properties = result.map['$'];

            //	Merge map properties if they exist
            if (result.map.properties) {
                result.map.properties[0].property.forEach(function(property) {
                    properties[property['$'].name] = property['$'].value;
                });
            }

            //	Load zone tileset
            var tileset = {
                source: result.map.tileset[0].image[0]['$'].source.replace('../public/static/img/engine/tile_sets/', ''),
                width: result.map.tileset[0].image[0]['$'].width,
                height: result.map.tileset[0].image[0]['$'].height
            }

            //	Load zone layers
            var layers = {};
            result.map.layer.forEach(function(layer) {

                //	Create new layer
                var new_layer = {
                    width: layer['$'].width,
                    height: layer['$'].height,
                    matrix: []
                }

                //	Create matrix array
                var matrix_array = [];

                //	Load layer matrix as array
                layer.data[0].tile.forEach(function(tile) {
                    matrix_array.push({tile: tile['$'].gid})
                });

                //	Chunk the matrix into X and Y
                var i = 0;
                for (i = 0, j = matrix_array.length; i < j; i += parseInt(properties.width)) {
                    new_layer.matrix.push(matrix_array.slice(i, i + parseInt(properties.width)));
                }
                ;

                //	Store layer
                layers[layer['$'].name] = new_layer;
            });

            //	Load events
            var events = [];
            if (result.map.objectgroup) {
                result.map.objectgroup.forEach(function(event_layer) {

                    //	We're only interested in the events layer for now
                    if (event_layer['$']['name'] == 'events') {

                        //	Loop objects
                        event_layer['object'].forEach(function(object) {

                            //	Calculate collision start
                            var object_x = object['$'].x / 16 + 1;
                            var object_y = object['$'].y / 16 + 1;

                            //	Create event cell
                            if (events[object_x] == undefined) {
                                events[object_x] = []
                            }
                            if (events[object_x][object_y] == undefined) {
                                events[object_x][object_y] = []
                            }

                            //	Create new properties array
                            var object_properties = {};

                            object.properties[0].property.forEach(function(object_property) {
                                object_properties[object_property['$'].name] = object_property['$'].value;
                            })

                            //	Add the event to the cell
                            events[object_x][object_y].push({
                                'name': object['$'].name,
                                'type': object['$'].type,
                                'properties': object_properties
                            })

                        })
                    }

                });
            }

            //	Store the zone
            zones[zone] = {};
            zones[zone].properties = properties;
            zones[zone].tileset = tileset;
            zones[zone].layers = layers;
            zones[zone].events = events;
            zones[zone].players = {};

            //	Run callback
            if (callback) {
                callback();
            }

        });

    });

    return true;
}

//	Load starting zone
load_zone('pallet_town');
load_zone('room_1');
load_zone('room_2');
load_zone('room_2_1');
load_zone('room_3');

//	Store player zone locations
var player_zones = {};

//	Array of playable characters
var player_characters = ['ash', 'kris'];

//	Listen for socket connections
io.sockets.on('connection', function(socket) {

    //	Store the players zone
    player_zones[socket.id] = 'pallet_town';

    //	Create a new player object
    zones[player_zones[socket.id]].players[socket.id] = {
        id: socket.id,
        x: zones[player_zones[socket.id]].properties.spawn_x,
        y: zones[player_zones[socket.id]].properties.spawn_y,
        sprite: player_characters[Math.floor(Math.random() * player_characters.length)],
        speed: 25,
        speed_modifier: 1,
        animation: 'walk_down',
        moving: false,
        frozen: false
    }

    //	Send the player zone data
    socket.emit('receive_zone', zones[player_zones[socket.id]]);

    //	Send other clients player joined
    Object.keys(zones[player_zones[socket.id]].players).forEach(function(player_id) {
        io.sockets.connected[player_id].emit('player_joined', zones[player_zones[socket.id]].players[socket.id]);
    });

    //	Bind on player move
    socket.on('player_move', function(direction) {

        //	Make sure the player isnt already moving, this prevents players changing their speed clientside hopefully
        if (zones[player_zones[socket.id]].players[socket.id].moving == false && zones[player_zones[socket.id]].players[socket.id].frozen == false) {

            //	Set source and destination x and y
            var source_x = zones[player_zones[socket.id]].players[socket.id].x;
            var source_y = zones[player_zones[socket.id]].players[socket.id].y;
            var destination_x = source_x;
            var destination_y = source_y;

            //	Calculate destination
            switch(direction){
                case 'up':
                    destination_y--;
                    break;
                case 'down':
                    destination_y++;
                    break;
                case 'left':
                    destination_x--;
                    break;
                case 'right':
                    destination_x++;
                    break;
            }

            //	Set animation to sync accross players
            zones[player_zones[socket.id]].players[socket.id].animation = 'walk_' + direction;

            if (detect_collision(player_zones[socket.id], destination_x, destination_y) == false) {

                //	Set player as moving
                zones[player_zones[socket.id]].players[socket.id].moving = true;
                zones[player_zones[socket.id]].players[socket.id].x = destination_x;
                zones[player_zones[socket.id]].players[socket.id].y = destination_y;

                //	Create timer to set player as not moving
                setTimeout(function() {

                    //	Make sure the player still exists at this point, they may DC for hacking or some shit...
                    if (zones[player_zones[socket.id]].players[socket.id] != undefined) {

                        //	Set player as not moving
                        zones[player_zones[socket.id]].players[socket.id].moving = false;

                        //	Check to see if the player stepped on an event tile!
                        detect_event(socket.id, player_zones[socket.id], destination_x, destination_y)
                    }

                }, (zones[player_zones[socket.id]].players[socket.id].speed / zones[player_zones[socket.id]].players[socket.id].speed_modifier) * 15)

                //	Tell every client in your zone you want to move
                Object.keys(zones[player_zones[socket.id]].players).forEach(function(player_id) {
                    io.sockets.connected[player_id].emit('player_move', zones[player_zones[socket.id]].players[socket.id], direction, source_x, source_y, destination_x, destination_y, false);
                });

            }
            else {

                //	Tell every client you want to move
                io.emit('player_move', zones[player_zones[socket.id]].players[socket.id], direction, source_x, source_y, source_x, source_y, true);

            }
        }
        else {
            console.log('Player moved wrongly');
            socket.disconnect();
        }

    })

    //	On player disconnect
    socket.on('disconnect', function() {

        //	Send other clients player leave
        socket.broadcast.emit('player_leave', socket.id);

        //	Remove the player from the current zone
        delete zones[player_zones[socket.id]].players[socket.id];

    });

});

//	Function to detect collition tiles
function detect_collision(zone, x, y) {

    x = x - 1
    y = y - 1

    //	Make sure we stay in bounds
    if (zones[zone].layers.collision.matrix[y] && zones[zone].layers.collision.matrix[y][x]) {

        //	Check for collitsion
        if (zones[zone].layers.collision.matrix[y][x].tile != 0) {

            //	Detected collision
            return true;

        }

    }

    //	No collision found
    return false
}

//	Function to detect event tiles
function detect_event(player, zone, x, y) {

    //	Check to make sure a cell even exists first!
    if (zones[zone].events[x] == undefined) {
        return false;
    }
    if (zones[zone].events[x][y] == undefined) {
        return false;
    }

    //	If we are here, we have a cell, so we have events. Loop and action all events. Hopefully this won't be huge!
    zones[zone].events[x][y].forEach(function(event) {

        //	Run logic on type
        switch(event.type){

            //	Run dor logic
            case 'door':

                //	Warp the player
                x = event.properties.x == undefined ? null : event.properties.x;
                y = event.properties.y == undefined ? null : event.properties.y;
                warp_player(player, event.properties.zone, x, y, event.properties.direction);
                break;

        }

    });


}

//	Function to move a player to a new zone
function warp_player(player, zone, x, y, direction) {

    //	First check to see if the player is already in the zone, if he is, we can just teleport them
    if (player_zones[player] == zone) {

        //	Teleport player
        teleport_player(player, (x == undefined ? zones[zone].properties.spawn_x : x), (y == undefined ? zones[zone].properties.spawn_y : y))

        //	Done
        return true;
    }

    //	Send other clients in zone player leave
    Object.keys(zones[player_zones[player]].players).forEach(function(player_id) {
        io.sockets.connected[player_id].emit('player_leave', player);
    })

    //	Store original zone
    var original_zone = player_zones[player];

    //	Make sure direction is defined
    var direction = direction == undefined ? 'down' : direction;

    //	Load the player into another zone
    zones[zone].players[player] = clone(zones[player_zones[player]].players[player]);
    zones[zone].players[player].animation = 'walk_' + direction;
    zones[zone].players[player].x = x == undefined ? zones[zone].properties.spawn_x : x;
    zones[zone].players[player].y = y == undefined ? zones[zone].properties.spawn_y : y;

    player_zones[player] = zone;

    //	Send the player zone data
    io.sockets.connected[player].emit('receive_zone', zones[zone]);

    //	Send other clients in new zone player joined
    Object.keys(zones[zone].players).forEach(function(player_id) {
        io.sockets.connected[player_id].emit('player_joined', zones[zone].players[player]);
    });

    //	Remove the player from the zone
    delete zones[original_zone].players[player];

    //	Done
    return true;

}

//	Function to teleport a player to an x y coordinate
function teleport_player(player, x, y) {

    //	Send other clients in zone player leave
    Object.keys(zones[player_zones[player]].players).forEach(function(player_id) {
        io.sockets.connected[player_id].emit('player_leave', player);
    })

    //	Set coords
    zones[player_zones[player]].players[player].x = x;
    zones[player_zones[player]].players[player].y = y;

    //	Send other clients in new zone player joined
    Object.keys(zones[player_zones[player]].players).forEach(function(player_id) {
        io.sockets.connected[player_id].emit('player_joined', zones[player_zones[player]].players[player]);
    });

    //	Done
    return true;
}

//	Console commands
process.stdin.resume();
process.stdin.setEncoding('utf8');
process.stdin.on('data', function(chunk) {

    //	Split data by spaces
    chunk = chunk.replace(/(\r\n|\n|\r)/gm, "").split(' ');

    //	Get command
    var command = chunk[0];

    //	Get arguments
    var args = chunk.slice(1);

    //	Switch case on the command
    switch(command){

        //	Command to warp players from one zone to another
        case 'warp':

            //	Make sure we have enough arguments
            if (args.length != 2) {
                process.stdout.write('Usage: warp <player_id> <to_zone>\n');
                break;
            }

            //	Check to see if the player exists in the zone
            if (zones[player_zones[args[0]]].players[args[0]] == undefined) {
                process.stdout.write('Player "' + args[0] + '" could not be found in the zone "' + player_zones[args[0]] + '".\n');
                break;
            }

            //	Check to see if the to zone exists
            if (zones[args[1]] == undefined) {
                process.stdout.write('Zone "' + args[1] + '" could not be found.\n');
                break;
            }

            //	Warp the player
            warp_player(args[0], args[1])

            break;

        //	Command to teleport a player to an x y coord
        case 'teleport':

            //	Make sure we have enough arguments
            if (args.length != 3) {
                process.stdout.write('Usage: teleport <player_id> <x> <y>\n');
                break;
            }

            //	Check to see if the player exists in the zone
            if (zones[player_zones[args[0]]].players[args[0]] == undefined) {
                process.stdout.write('Player "' + args[0] + '" could not be found in the zone "' + player_zones[args[0]] + '".\n');
                break;
            }

            //	Teleport the player
            teleport_player(args[0], args[1], args[2])

            break;

        //	A command was not found
        default:
            process.stdout.write('Command "' + command + '" could not be found\n');
            break;

    }

});

//	Utility functions
function clone(x) {
    if (x === null || x === undefined)
        return x;
    if (x.clone)
        return x.clone();
    if (x.constructor == Array) {
        var r = [];
        for (var i = 0, n = x.length; i < n; i++)
            r.push(clone(x[i]));
        return r;
    }
    return x;
}
