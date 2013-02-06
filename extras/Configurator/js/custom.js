var connectionId = -1;
var port_list;
var serial_poll;

var eepromConfig;

var eepromConfigDefinition = {
    eepromConfigDefinition: {
        version:      'uint8',
        calibrateESC: 'uint8',

        ACCEL_BIAS:  ['array', 'int16', 3],

        PID_YAW_c:   ['array', 'float64', 4],
        PID_PITCH_c: ['array', 'float64', 4],
        PID_ROLL_c:  ['array', 'float64', 4],

        PID_YAW_m:   ['array', 'float64', 4],
        PID_PITCH_m: ['array', 'float64', 4],
        PID_ROLL_m:  ['array', 'float64', 4],

        PID_BARO:    ['array', 'float64', 4],
        PID_SONAR:   ['array', 'float64', 4]
    }
}; 


$(document).ready(function() { 
    var port_picker = $('div#port-picker .port');
    var baud_picker = $('div#port-picker #baud');
    var delay_picker = $('div#port-picker #delay');
    
    $('div#port-picker a.refresh').click(function() {
        console.log("Available port list requested.");
        port_picker.html('');

        chrome.serial.getPorts(function(ports) {
            if (ports.length > 0) {
                // Port list received
                port_picker.html('<select id="port"></select>');
                
                ports.forEach(function(port) {
                    $('select', port_picker).append($("<option/>", {
                        value: port,
                        text: port
                    }));        
                });
            } else {
                // Looks like this check is kinda useless as the serial API doesn't seem to work in windows
                // at all, requires v25>
                // No serial ports found (do something/offer solution)
                console.log("No serial ports detected");
            }
        });
    });
    
    // software click to refresh port picker select during first load
    $('div#port-picker a.refresh').click();
    
    $('div#port-picker a.connect').click(function() {
        var clicks = $(this).data('clicks');
        
        if (clicks) { // odd number of clicks
            chrome.serial.close(connectionId, onClosed);
            
            clearInterval(serial_poll);
            
            $(this).text('Connect');
            $(this).removeClass('active');            
        } else { // even number of clicks         
            var selected_port = $('select#port', port_picker).val();
            var selected_baud = parseInt(baud_picker.val());
            var selected_delay = parseInt(delay_picker);
            
            chrome.serial.open(selected_port, {
                bitrate: selected_baud
            }, onOpen);
            
            setTimeout(function() {
                // start polling
                serial_poll = setInterval(readPoll, 10);
            }, selected_delay * 1000);    
            
            $(this).text('Disconnect');  
            $(this).addClass('active');
        }
        
        $(this).data("clicks", !clicks);
    }); 

    // Tabs
    var tabs = $('#tabs > ul');
    $('a', tabs).click(function() {
        if (connectionId < 1) { // if there is no active connection, return
            return;
        }
        // disable previous active button
        $('li', tabs).removeClass('active');
        
        // Highlight selected button
        $(this).parent().addClass('active');
        
        switch ($(this).parent().index()) {
            case 0: // initial setup
                $('#content').load("./tabs/initial_setup.html");
            break;
            case 1: // pid tuning
                $('#content').load("./tabs/pid_tuning.html", function() {
                    var i = 0;
                    
                    // Command
                    $('#content .command-yaw input').each(function() {
                        $(this).val(eepromConfig.PID_YAW_c[i++]);
                    });
                    
                    i = 0;
                    $('#content .command-pitch input').each(function() {
                        $(this).val(eepromConfig.PID_PITCH_c[i++]);
                    });
                    
                    i = 0;
                    $('#content .command-roll input').each(function() {
                        $(this).val(eepromConfig.PID_ROLL_c[i++]);
                    });

                    // Motor
                    i = 0;
                    $('#content .motor-yaw input').each(function() {
                        $(this).val(eepromConfig.PID_YAW_m[i++]);
                    });
                    
                    i = 0;
                    $('#content .motor-pitch input').each(function() {
                        $(this).val(eepromConfig.PID_PITCH_m[i++]);
                    });
                    
                    i = 0;
                    $('#content .motor-roll input').each(function() {
                        $(this).val(eepromConfig.PID_ROLL_m[i++]);
                    });

                    // Baro
                    i = 0;
                    $('#content .baro input').each(function() {
                        $(this).val(eepromConfig.PID_BARO[i++]);
                    });
                    
                    // Sonar
                    i = 0;
                    $('#content .sonar input').each(function() {
                        $(this).val(eepromConfig.PID_SONAR[i++]);
                    });                    
                    
                });
            break;            
            case 2: // Sensor data
                $('#content').load("./tabs/sensor_data.html");
            break;
            case 3: // TX/RX data
                $('#content').load("./tabs/rx.html");
            break;
            case 4: // 3D vehicle view
                $('#content').load("./tabs/vehicle_view.html");
            break;
            case 5: // Motor output
                $('#content').load("./tabs/motor_output.html");
            break;
            case 6: // About
                $('#content').load("./tabs/about.html");
            break;
        }
    });
 
    // Load initial tab to content div
    $('li > a:first', tabs).click(); 
    
    // Specific functions in content
    $('#content').delegate('.calibrateESC', 'click', function() {  
        eepromConfig.calibrateESC = parseInt(1);
        
        var eepromConfigBytes = new ArrayBuffer(264);
        var view = new jDataView(eepromConfigBytes, 0, undefined, true);
        
        var composer = new jComposer(view, eepromConfigDefinition);
        var eepromBuffer = view.buffer;
        composer.compose(['eepromConfigDefinition'], eepromConfig);

        var bufferOut = new ArrayBuffer(5);
        var bufView = new Uint8Array(bufferOut);
        
        bufView[0] = 0xB5; // sync char 1
        bufView[1] = 0x62; // sync char 2
        bufView[2] = 0x02; // command
        bufView[3] = 0x01; // payload length MSB (0x108)
        bufView[4] = 0x08; // payload length LSB   
        
        chrome.serial.write(connectionId, bufferOut, function(writeInfo) {});
        
        chrome.serial.write(connectionId, eepromConfigBytes, function(writeInfo) {
            if (writeInfo.bytesWritten > 0) {
                console.log("Wrote: " + writeInfo.bytesWritten + " bytes");
                
                command_log('Sending Configuration UNION to Flight Controller ...');
            }    
        });
    });
    
    $('#content').delegate('.pid_tuning a.update', 'click', function() {
        var parent = $(this).parent().parent();
        
        var i = 0;
        switch (parent.index()) {
            case 1: // command yaw
                $('input', parent).each(function() {
                    eepromConfig.PID_YAW_c[i] = parseFloat($(this).val());
                    i++;
                });            
            break;
            case 2: // command pitch
                $('input', parent).each(function() {
                    eepromConfig.PID_PITCH_c[i] = parseFloat($(this).val());
                    i++;
                });  
            break;
            case 3: // command roll
                $('input', parent).each(function() {
                    eepromConfig.PID_ROLL_c[i] = parseFloat($(this).val());
                    i++;
                });              
            break;
            case 5: // yaw
                $('input', parent).each(function() {
                    eepromConfig.PID_YAW_m[i] = parseFloat($(this).val());
                    i++;
                });              
            break;
            case 6: // pitch
                $('input', parent).each(function() {
                    eepromConfig.PID_PITCH_m[i] = parseFloat($(this).val());
                    i++;
                });              
            break;
            case 7: // roll
                $('input', parent).each(function() {
                    eepromConfig.PID_ROLL_m[i] = parseFloat($(this).val());
                    i++;
                });              
            break;
            case 9: // baro
                $('input', parent).each(function() {
                    eepromConfig.PID_BARO[i] = parseFloat($(this).val());
                    i++;
                });              
            break;
            case 10: // sonar
                $('input', parent).each(function() {
                    eepromConfig.PID_SONAR[i] = parseFloat($(this).val());
                    i++;
                });              
            break;
        }
        
        var eepromConfigBytes = new ArrayBuffer(264);
        var view = new jDataView(eepromConfigBytes, 0, undefined, true);
        
        var composer = new jComposer(view, eepromConfigDefinition);
        var eepromBuffer = view.buffer;
        composer.compose(['eepromConfigDefinition'], eepromConfig);

        var bufferOut = new ArrayBuffer(5);
        var bufView = new Uint8Array(bufferOut);
        
        bufView[0] = 0xB5; // sync char 1
        bufView[1] = 0x62; // sync char 2
        bufView[2] = 0x02; // command
        bufView[3] = 0x01; // payload length MSB (0x108 = 264)
        bufView[4] = 0x08; // payload length LSB   
        
        chrome.serial.write(connectionId, bufferOut, function(writeInfo) {});
        
        chrome.serial.write(connectionId, eepromConfigBytes, function(writeInfo) {
            if (writeInfo.bytesWritten > 0) {
                console.log("Wrote: " + writeInfo.bytesWritten + " bytes");
                
                command_log('Sending Configuration UNION to Flight Controller ...');
            }    
        });
        
        chrome.serial.write(connectionId, str2ab("]"), function(writeInfo) {});
    });
    
});


function onOpen(openInfo) {
    connectionId = openInfo.connectionId;
    
    if (connectionId != -1) {
        console.log('Connection was opened with ID: ' + connectionId);
        command_log('Connection to the serial BUS was opened with ID: ' + connectionId);
        
        // Start reading
        chrome.serial.read(connectionId, 1, onCharRead);
        
        // request configuration data (so we have something to work with)
        var bufferOut = new ArrayBuffer(6);
        var bufView = new Uint8Array(bufferOut);
        
        bufView[0] = 0xB5; // sync char 1
        bufView[1] = 0x62; // sync char 2
        bufView[2] = 0x01; // command
        bufView[3] = 0x00; // payload length MSB
        bufView[4] = 0x01; // payload length LSB
        bufView[5] = 0x01; // payload
        
        chrome.serial.write(connectionId, bufferOut, function(writeInfo) {
            console.log("Wrote: " + writeInfo.bytesWritten + " bytes");
            command_log('Requesting configuration UNION from Flight Controller');
        });  
    } else {
        console.log('There was a problem in opening the connection.');
    }    
};

function onClosed(result) {
    if (result) { // All went as expected
        console.log('Connection closed successfully.');
        command_log('Connection closed -- <span style="color: green;">OK</span>');
        
        connectionId = -1; // reset connection id
        $('#content').empty(); // empty content
        $('#tabs > ul li').removeClass('active'); // de-select any selected tabs
    } else { // Something went wrong
        console.log('There was an error that happened during "connection-close" procedure.');
        command_log('Connection closed -- <span style="color: red;">ERROR</span>');
    }    
};

function readPoll() {
    chrome.serial.read(connectionId, 24, onCharRead);
};


var packet_state = 0;
var command_buffer = new Array();
var command;

var message_length_expected = 0;
var message_length_received = 0;
var message_buffer = new Array();

function onCharRead(readInfo) {
    if (readInfo && readInfo.bytesRead > 0 && readInfo.data) {
        var data = new Uint8Array(readInfo.data);
        
        for (var i = 0; i < data.length; i++) {
            switch (packet_state) {
                case 0:
                    if (data[i] == 0xB5) { // sync char 1                 
                        packet_state++;
                    }
                break;
                case 1:
                    if (data[i] == 0x62) { // sync char 2                 
                        packet_state++;
                    } else {
                        packet_state = 0; // Restart and try again
                    }                    
                break;
                case 2: // command
                    command = data[i];
                    
                    packet_state++;
                break;
                case 3: // payload length MSB
                    message_length_expected = 0; // reset
                    message_length_expected = data[i] << 8;
                    
                    packet_state++;
                break;
                case 4: // payload length LSB
                    message_length_expected |= data[i];
                    
                    packet_state++;
                break;
                case 5: // payload
                    message_buffer[message_length_received] = data[i];
                    message_length_received++;
                    
                    if (message_length_received >= message_length_expected) {
                        // message received, process
                        process_data();
                        
                        // Reset variables
                        message_buffer.length = 0; // empty array
                        message_length_received = 0;
                        
                        packet_state = 0;
                    }
                break;
            }
        }
    }
};

function process_data() {
    console.log(command);
    switch (command) {
        case 1: // configuration data
            var eepromConfigBytes = new ArrayBuffer(264);
            var eepromConfigBytesView = new Uint8Array(eepromConfigBytes);
            for (var i = 0; i < message_buffer.length; i++) {
                eepromConfigBytesView[i] = message_buffer[i];
            }
            
            var view = new jDataView(eepromConfigBytes, 0, undefined, true);
   
            var parser = new jParser(view, eepromConfigDefinition);

            eepromConfig = parser.parse('eepromConfigDefinition');
            
            $('#tabs li a:first').click();
            command_log('Configuration UNION received -- <span style="color: green">OK</span>');
        break;
        case 9: // ACK
            var message = parseInt(message_buffer);
            
            if (message == 1) {
                console.log("ACK");
                command_log('Flight Controller responds with -- <span style="color: green">ACK</span>');
            } else {
                console.log("REFUSED");
                command_log('Flight Controller responds with -- <span style="color: red">REFUSED</span>');
            }
        break;
    }
}

function command_log(message) {
    var d = new Date();
    var time = d.getHours() + ':' + ((d.getMinutes() < 10) ? '0' + d.getMinutes(): d.getMinutes()) + ':' + ((d.getSeconds() < 10) ? '0' + d.getSeconds(): d.getSeconds());
    
    $('div#command-log > div.wrapper').append('<p>' + time + ' -- ' + message + '</p>');
    $('div#command-log').scrollTop($('div#command-log div.wrapper').height());    
}

// String to array buffer
function str2ab(str) {
    var buf = new ArrayBuffer(str.length);
    var bufView = new Uint8Array(buf);
    
    for (var i = 0, strLen = str.length; i < strLen; i++) {
        bufView[i] = str.charCodeAt(i);
    }
    
    return buf;
}