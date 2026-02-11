export async function onRequest(){
    return new Response("pong", {
        status: 200,
        headhers : { "content-type": "text/plain"},
    });
}