//This file contains js functionality that's for use in ALL pi instances, regardless of their exact functionality. 

//Injects global settings that should be included in every plugin instance- device select, delete, add new
document.getElementById("global-config").innerHTML = `
<div type="select" class="sdpi-item">
    <div class="sdpi-item-label">Device</div>
    <select id="device-dropdown" class="sdpi-item-value select setvalueSelect" onchange="deviceDropdownChanged()">
        <option value="none-device-select">-none-</option>
        <option value="add-new-device-select">add new...</option>
    </select>
    <button class="sdpi-item-value" id="delete-device" onclick="deleteCurrentlySelectedDevice()" style="display:none">Delete</button>
</div>

<div style="display:none" id="add-new-device">

    <!-- ip address -->
    <div class="sdpi-item"  title="Enter the IP address of your target PVP machine. This can be found under System Preferences>Network">
    <div class="sdpi-item-label">IP Address</div>
    <input class="sdpi-item-value" id="new-device-ip-address" value="" placeholder="System prefs>Network e.g. 10.1.1.5" required pattern="^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$">
    </div>

    <!-- port -->
    <div class="sdpi-item" title="Enter the Network API port for your target PVP machine. This can be found under PVP>preferences>network>port">
    <div class="sdpi-item-label">Port</div>
    <input class="sdpi-item-value" id="new-device-port" value="" placeholder="PVP>Prefs>Network>port e.g. 32875" required pattern="^([1-9][0-9]{3}|[1-5][0-9]{4}|6[0-4][0-9]{3}|65[0-4][0-9]{2}|655[0-2][0-9]|6553[0-5])$">
    </div>

    <div class="sdpi-item" id="addNewDevice">
        <div class="sdpi-item-label empty"></div>
        <button onclick="addNewDevice()" class="sdpi-item-value">Add New PVP Device</button>
    </div>    

</div>

<div id="device-offline" style="display:none">
    <h4>Error connecting to PVP. Please check your connection to the target PVP machine.</h4>
    <p>-Ensure you have the correct ip address & port number</p>
    <p>-Enable "Network API" under PVP>Preferences>Network</p>
    <p>-Disable "Use HTTPS Connection"
    <p>-Disable "Require Authentication"</p>
</div>
`;

var ws = null;
var propertyInsspectorContext = null
var actionContext = null;
var globalSettings = null;
var actionSettings = null;

//for use in the pi specific options
const deviceConstantOptionValues = ["none-device-select", "add-new-device-select"];

function connectElgatoStreamDeckSocket(inPort, inPropertyInspectorUUID, inRegisterEvent, inInfo, inActionInfo){
    var websocket = new WebSocket("ws://localhost:" + inPort);

    ws = websocket;

    websocket.onopen = function(){
        //socket is connected, register property inspector with strem deck software

        json = {
            "event": inRegisterEvent,
            "uuid": inPropertyInspectorUUID
        }
        
        send = websocket.send(JSON.stringify(json));

        //set the context global var from the parameters
        propertyInspectorContext = Object.freeze(inPropertyInspectorUUID);
        actionContext = Object.freeze(JSON.parse(inActionInfo).context);

        //Get global settings and action settings, select the previously used device in action settings
        sendToElgatoEvents.getGlobalSettings()
        .then(resolve => {sendToElgatoEvents.getSettings()
        .then(resolve => {
            formatDeviceSelect();
            selectDeviceFromActionSettings();
            styleDeviceDropdown();

            //fire off event that tells pi frontend that it's been connected after settings are retrieved.
            window.dispatchEvent(customEvents.propertyInspectorConnectedEvent);
        })});
    };
    
    websocket.onmessage = function(event){
        data = JSON.parse(event.data);

        switch (data.event){
            case "didReceiveGlobalSettings":
                receivedEvents.didReceiveGlobalSettings(data.payload.settings);
                break;
            case "didReceiveSettings":
                receivedEvents.didReceiveSettings(data.payload.settings);
                break;
            default:
                console.log("Received unknown event: " + data.event);
        }
    }
}


var receivedEvents = {
    didReceiveGlobalSettings: function(settings){
        globalSettings = settings;
          
    },

    didReceiveSettings : function(settings){
        actionSettings = settings;

    },

}


var sendToElgatoEvents = {
    //Get settings for this action's instance
        getSettings: function(){
            return new Promise(function(resolve, reject){
            json = {
                "event": "getSettings",
                "context": propertyInspectorContext
            }

            ws.addEventListener("message", function handler(e){
                received = JSON.parse(e.data);
                if (received.event == "didReceiveSettings"){
                    settings = received.payload.settings;

                    actionSettings = settings;

                    ws.removeEventListener("message", handler);

                    resolve(settings);
                }
            });

            ws.send(JSON.stringify(json));
            })
        },

        setSettings: function(payload){
            //Settings should look like:
            // {
            //     "deviceDropdownSelected": "device_10.1.60.143",
            //      "additionalPropertySpecificToThisAction": "value"
            // }

            actionSettings = payload;

            json = {
                "event": "setSettings",
                "context": propertyInspectorContext,
                "payload": payload
            }

            ws.send(JSON.stringify(json));           
        },

        getGlobalSettings: function(){

            return new Promise(function(resolve, reject){
                json = {
                    "event": "getGlobalSettings",
                    context: propertyInspectorContext
                }

                ws.addEventListener("message", function handler(e){
                    received = JSON.parse(e.data);
                    if (received.event == "didReceiveGlobalSettings"){
                        settings = received.payload.settings;

                        globalSettings = settings;
                       
                        ws.removeEventListener("message", handler);
                        
                        resolve(globalSettings);
                    }

                });
                ws.send(JSON.stringify(json));
            });
        },

        setGlobalSettings: function(payload){
            json = {
                    "event": "setGlobalSettings",
                    "context": propertyInspectorContext,
                    "payload": payload
                }

            ws.send(JSON.stringify(json));
        },

        sendToPlugin: function(what){
            json = {
                    "action": "com.github.rplucker.streamdeckpvp.triggercue",
                    "event": "sendToPlugin",
                    "context": propertyInspectorContext,
                    "payload": {"sendToPlugin": "TestPayload"}
            }

        ws.send(json);
        },

        logMessage: function(message){
            json = {
                "event": "logMessage",
                "payload": {
                    "message": message
                }
            }
            ws.send(JSON.stringify(json));
        }
}


var sendToPVP = {
    getPlaylists(ip, port){
        return new Promise(function(resolve, reject){
            let xhr = new XMLHttpRequest();
            xhr.timeout = 2000;
            xhr.open("GET", `http://${ip}:${port}/api/0/data/playlists`);

            xhr.onload = () => {
                if (xhr.status === 200){
                    resolve(JSON.parse(xhr.responseText));
                }
                else{
                    reject(Error(xhr.statusText));
                }
            };

            xhr.ontimeout = () => {
                reject(Error("Timeout"));
            }

            xhr.onerror = () =>{
                reject(Error("Network Error"))
            };
            xhr.send();
        });
    },

    getLayers(ip, port){
        return new Promise(function(resolve, reject){
            let xhr = new XMLHttpRequest();
            xhr.timeout = 2000;
            xhr.open("GET", `http://${ip}:${port}/api/0/data/layers`);

            xhr.onload = () => {
                if (xhr.status === 200){
                    resolve(JSON.parse(xhr.responseText));
                }
                else{
                    reject((Error(xhr.statusText)));
                }
            }

            xhr.onTimeout = () =>{
                reject(Error("Timeout"));
            }

            xhr.onError = () => {
                reject(Error("Network error"))
            }
            xhr.send();
        })
    }
}

const customEvents = {
    //event that fires off when deviceDropdownChanged is called. used for communcation to PI 
    deviceDropdownChangedEvent: new CustomEvent("deviceDropdownChangedEvent"),

    propertyInspectorConnectedEvent: new CustomEvent("propertyInspectorConnectedEvent"),
}

function styleDeviceDropdown(){

    selectedValue = $("#device-dropdown").val();

    checkOnline = () => {
        ipPort = selectedValue.split("_")[1]
        ipAddr = ipPort.split(":")[0]
        portNumber = ipPort.split(":")[1]
        
        //check to see if pvp device is online, style accordingly
        sendToPVP.getPlaylists(ip=ipAddr, port=portNumber)
        .then(resolve => {$("#device-offline").hide()})
        .catch(reject => {$("#device-offline").show(); $("#pi-specific-options").hide();})
    }

    switch(selectedValue){
        case null: //window has just been loaded and nothing is set. Set to none and redo
            $("#device-dropdown").val("none-device-select")
            styleDeviceDropdown();
            break;
        case "none-device-select":
            $("#device-offline").hide();
            $("#delete-device").hide();
            $("#add-new-device").hide();
            $("#pi-specific-options").hide();
            break;
        case "add-new-device-select":
            $("#device-offline").hide();
            $("#delete-device").hide();
            $("#add-new-device").show();
            $("#pi-specific-options").hide();
            break;
        default: //a device was selected
            $("#delete-device").show();
            $("#add-new-device").hide();
            $("#pi-specific-options").show();
            checkOnline();
            break;
    }
}

function selectDeviceFromActionSettings(){
    $("#device-dropdown").val(actionSettings.deviceDropdownSelected)
}


function formatDeviceSelect(){
    constantOptionValues = ["none-device-select", "add-new-device-select"];

    $("#device-dropdown option").each(function(index){
        //remove all options except none and add new
        if (!constantOptionValues.includes($(this).val())){
            this.remove();
        }
    })

    globalSettings.devices.forEach(device => {
        $("#device-dropdown").append($("<option>",
        {
            value: `device_${device.ipAddr}:${device.port}`,
            text: `${device.ipAddr}:${device.port}`
        }))
    });
}

//remove currently selected device & refresh device list
function deleteCurrentlySelectedDevice(){
    currentlySelectedIndex = $("#device-dropdown").prop("selectedIndex");

    //remove this option from the global settings. -2 is needed because -none- and add new... will throw off index value
    globalSettings.devices.splice(currentlySelectedIndex-2, 1);
    
    //after removing, reformat the select
    formatDeviceSelect();
    deviceDropdownChanged();

    //Send the global settings to elgato
    sendToElgatoEvents.setGlobalSettings(globalSettings);
}


function addNewDevice(){
    newDevicePayload = {
       "ipAddr": $("#new-device-ip-address").val(),
       "port": $("#new-device-port").val()
    }

        //data has already been read upon plugin registration. Data structure looks like {dict<list<dict>>}:
    // {
    //     "devices": [
    //         {"ipAddr": "1.1.1.1",
    //         "port": "2.2.2.2"},
    //         {"ipaddr": "2222",
    //         "port": "3333"}
    //     ]
    // }

    var devicesFileToBeWritten = null;

    if (globalSettings.devices == null || globalSettings.devices == undefined) { //no devices file has been created yet, create empty data
        devicesFileToBeWritten = {
            "devices": []
        }
    }
    else{ //devies file has been created
        devicesFileToBeWritten = globalSettings
    }

    //add new device to end of array
    devicesFileToBeWritten.devices.push(newDevicePayload);

    //send global settings to elgato
    sendToElgatoEvents.setGlobalSettings(devicesFileToBeWritten);

    //select -none- from the deivce list 
    $("#device-dropdown").val("none-device-select");
    deviceDropdownChanged();
    formatDeviceSelect();
}