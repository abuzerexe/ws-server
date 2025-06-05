import { WebSocketServer, WebSocket } from "ws";
import { nanoid } from 'nanoid';

const port = process.env.PORT ? parseInt(process.env.PORT) : 8080;
const wss = new WebSocketServer({port},()=>{
  console.log("Server listening on port 8080")
});

interface Room {
  roomName: string;  
  createdBy: string;
  participants: Set<WebSocket>;
  lastActive: number
};

interface User {
    userId : string; 
    userName : string
}

const rooms = new Map<string,Room>() 

const users = new Map<WebSocket,User>() // socket, name,id of the user



wss.on("connection",(ws)=>{
    console.log("user connected")

    ws.on("message",(message)=>{ // we will get json as string 

        const parsedMessage = JSON.parse(message as unknown as string) 
        const type = parsedMessage.type
        const payload = parsedMessage.payload
        
        if(type == "create-room"){
             createRoom(payload, ws)
          
        }
        else if(type == "join-room"){
             joinRoom(payload,ws)
            
        }
        else if(type == "broadcast"){
             broadcastToRoom(parsedMessage,ws)
        }
        else if(type == "leave-room"){
            const message = leaveRoom(payload,ws)
            ws.send(JSON.stringify(message));
        }
    })

    ws.on("close",()=>{
      handleDisconnet(ws);
    })
})



/*
    CREATE ROOM 

    CLIENT:
  {
  "type": "create-room",
  "payload": {
    "roomName": "General Chat",
    "createdBy": "Abuzer"
  }
}

  SERVER:
  {
    type: "room-created",
    payload: {
      "userId" : "23456",  
      "roomId" : "23232",
      "roomName" : "General Chat",
      "userCount" : 1,
      "message": "Room "General Chat" created successfully".
    }
  }

  Error:
  {
      type: "error-home",
      payload: {
        error: "Failed to create room. Please try again.",
        context: "create-room"
      }
    }
*/

function createRoom( payload: Room, ws: WebSocket){

try{
    const roomId = generateRoomId()
    const roomName = payload.roomName
    const createdBy = payload.createdBy

    rooms.set(roomId,{roomName, createdBy, participants: new Set([ws]),lastActive:Date.now()})

    const existingUser = users.get(ws);

    const userId = existingUser?.userId ?? generateUserId();
    
    users.set(ws,{userId,userName: createdBy})
     console.log("creating room for user with id: "+ userId + " and name: " + createdBy+ " room id: "+roomId)
    const message = {
    type: "room-created",
    payload: {
      userId,  
      roomId,
      roomName,
      userCount : 1,
      message: `Room "${roomName}" created successfully.`
    }
  }
   ws.send(JSON.stringify(message))
  return 

}catch(e){
    console.log("Create Room error: "+e)
    const message = {
      type: "error-home",
      payload: {
        error: "Failed to create room. Please try again.",
        context: "create-room"
      }
    }
     ws.send(JSON.stringify(message))
    return 
}

}


/*
    JOIN ROOM 

    CLIENT

    {
   "type": "join-room",
   "payload": {
	   "roomId": "abc123",
     "userName" : "abuzer"
   }
}

    SERVER

    {
      type: "room-joined",
      payload: {
      "userId" : "23456",  
      "roomId" : "23232",
      "roomName" : "General Chat",
      "createdBy": "Abuzer",
      "userCount": 2,
      "message": `Room "General Chat" joined successfully.`
      }

      announcing user through broadcast message

      Error
      {
      type: "error-home",
      payload: {
        error: "Room not found.", or error: "Failed to join room. Please try again.",
        context: "join-room"
      }
    }
      
*/


function joinRoom( payload, ws: WebSocket){

try{
    const roomId = payload.roomId
    const userName = payload.userName

    if(rooms.has(roomId)){
        const existingUser = users.get(ws);
        const userId = existingUser?.userId ?? generateUserId();        
        
        users.set(ws,{userId,userName})
        const room = rooms.get(roomId)
        room.participants.add(ws)
        room.lastActive = Date.now()
        const roomName = room.roomName


          const broadcastMessage = {
            type: "system",
            payload: {
              roomId,
              userId,
              message : `${userName} has joined the room.`
            }
          }
            broadcastToRoom(broadcastMessage,ws)

            const message = {
            type: "room-joined",
            payload: {
            userId,  
            roomId,
            roomName,
            createdBy: room.createdBy,
            userCount: room.participants.size,
            message: `Room "${roomName}" joined successfully.`
            }
        }
        ws.send(JSON.stringify(message))
        return 

    }else{
    const message = {
      type: "error-home",
      payload: {
        error: "Room not found.",
        context: "join-room"
      }
    }
    ws.send(JSON.stringify(message))
    return 
    }
  }catch(e){
    console.log("Join Room error: "+e)

    const message = {
      type: "error-home",
      payload: {
        error: "Failed to join room. Please try again.",
        context: "join-room"
      }
    }
    ws.send(JSON.stringify(message))
    return
  }
}


/*
    BROADCAST TO ROOM 

    CLIENT 
    {
   "type": "broadcast",
   "payload": {
	 "roomId": "791348",
    "message" : "hi"
    }}

  SERVER

  // chat message

  {"type":"message",
  "payload":{
  "id" :"23n23w"
  "message":"hi",
  "senderId":"I0uwDAV",
  "senderName":"Random2",
  "timestamp":"2025-05-23T22:44:19.609Z"
  }}

  // announcing user

  {"type":"system",
  "payload":{
  "message":"Random1 has joined the room.",
  "senderId":"b9nqMPA",
  "userCount" : 2
  "timestamp":"2025-05-23T22:40:55.515Z"}}
*/

function broadcastToRoom(parsedMsg, ws: WebSocket){

try{
    const roomId = parsedMsg.payload.roomId

    if(!rooms.has(roomId)){
    const message = {
      type: "error",
      payload: {
        error: "There is no room with this Room Id.",
        context: "broadcast"
      }
    }
    ws.send(JSON.stringify(message))
    return 
    } 

    const sender = users.get(ws)
    let message = {}

    if(parsedMsg.type == "system"){
      message = {
        type: "system",
        payload: {
          message : parsedMsg.payload.message,
          senderId : sender.userId,
          userCount: rooms.get(roomId).participants.size,
          timestamp: new Date().toISOString()

      }
    }
    }else{
      message = {
        type: "message",
        payload: {
          id : nanoid(6),
          content : parsedMsg.payload.message,
          senderId : sender.userId,
          senderName : sender.userName,
          timestamp: new Date().toISOString()

      }
    }
    }

    const participants = rooms.get(roomId).participants
    rooms.get(roomId).lastActive = Date.now()

    participants.forEach((participant)=>{
            participant.send(JSON.stringify(message))
        
    })

  }catch(e){
        console.log("Broadcast to Room error: "+e)
      const message = {
      type: "error",
      payload: {
        error: "Error occured",
        context: "broadcast"
      }
    }
    ws.send(JSON.stringify(message))
    return 

  }
}
/*
  CLIENT
  {
  "type": "leave-room",
  "payload": {
    "roomId": "552721"
  }
}

SERVER



*/
function leaveRoom(payload, ws: WebSocket) {
  const { roomId } = payload;
  const user = users.get(ws);

  if (!user || !rooms.has(roomId)) {
    return {
      type: "error",
      payload: {
        error: "Invalid user or room ID.",
        context: "leave-room"
      }
    };
  }

  const room = rooms.get(roomId);
  room.participants.delete(ws);
  room.lastActive = Date.now()

  
  const leaveNotice = {
    type: "system",
    payload: {
      roomId,
      senderId: user.userId,
      senderName: user.userName,
      userCount : room.participants.size,
      message: `${user.userName} has left the room.`,
      timestamp: new Date().toISOString()
    }
  };

  room.participants.forEach(participant => {
    participant.send(JSON.stringify(leaveNotice));
  });

  // Cleanup if empty
  if (room.participants.size === 0) {
    rooms.delete(roomId);
    console.log("deleting room with id "+ roomId+". Remaning rooms: "+ rooms.size)
    
  }

  return {
    type: "leave-success",
    payload: {
      message: `You left the room "${room.roomName}".`,
      roomId,
    }
  };
}

function handleDisconnet(ws : WebSocket){

  const user = users.get(ws)

  if(!user){
    return
  }

  users.delete(ws);

  rooms.forEach((room,roomId)=>{
    if(room.participants.has(ws)){

        const disconnectMessage = {
        type: "system",
        payload: {
          roomId,
          senderId: user.userId,
          senderName: user.userName,
          message: `${user.userName} has disconnected.`,
          userCount: room.participants.size,
          timestamp: new Date().toISOString()
        }
      };
      
      room.participants.forEach((user)=>{
        user.send(JSON.stringify(disconnectMessage))
      })

      room.participants.delete(ws)
      room.lastActive = Date.now()
    }

      if(room.participants.size === 0){
        rooms.delete(roomId)
        console.log("deleting room with id: "+roomId +". Remaning rooms: "+ rooms.size)
      }
  })


}

setInterval(() => {
  const now = Date.now();
  rooms.forEach((room, roomCode) => {
    if (room.participants.size === 0 && now - room.lastActive > 3600000) {
      rooms.delete(roomCode);
      console.log(`Cleaning up inactive room: ${roomCode}. Remaning rooms:  ${rooms.size}`);
      
    }
  });
}, 3600000);

function generateRoomId(): string{
    let id : string;
    do {
        id = Math.floor(100000 + Math.random() * 900000 ).toString()
    } while (rooms.has(id));

    return id;
}

function generateUserId():string{
    const userId = nanoid(7)

    return userId;

}   