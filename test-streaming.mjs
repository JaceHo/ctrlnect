// Test if stream_event deltas actually arrive from SDK
const res = await fetch('http://localhost:3001/api/sessions', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ title: 'StreamTest' }),
});
const session = await res.json();

const ws = new WebSocket('ws://localhost:3001/ws');
const allEvents = [];

ws.onopen = () => {
  ws.send(JSON.stringify({ type: 'subscribe', sessionId: session.id }));
  setTimeout(() => {
    ws.send(JSON.stringify({
      type: 'chat', sessionId: session.id,
      text: 'Write a paragraph about the ocean, at least 100 words.'
    }));
  }, 300);
};

ws.onmessage = (event) => {
  const msg = JSON.parse(event.data);
  if (msg.type === 'agent_event') {
    const ev = msg.event;
    allEvents.push(ev.type);

    if (ev.type === 'stream_event') {
      const inner = ev.event;
      if (inner?.type === 'content_block_delta') {
        const delta = inner.delta;
        if (delta?.type === 'text_delta') {
          process.stdout.write(delta.text || '');
        } else if (delta?.type === 'thinking_delta') {
          // thinking streaming
        }
      }
    }
  }

  if (msg.type === 'stream_end') {
    console.log('\n\n--- Event types received ---');
    const counts = {};
    for (const t of allEvents) counts[t] = (counts[t] || 0) + 1;
    console.log(counts);
    ws.close();
    setTimeout(() => process.exit(0), 500);
  }
};

ws.onerror = () => console.log('WS ERROR');
setTimeout(() => { console.log('TIMEOUT'); process.exit(1); }, 120000);
