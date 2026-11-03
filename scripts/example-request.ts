// Generate a current fixture input; this is not added to model instructions.
const deadline = new Date();
deadline.setDate(deadline.getDate() + 3);
deadline.setHours(17, 0, 0, 0);
const day = new Intl.DateTimeFormat('en-US', {
  weekday: 'long', month: 'long', day: 'numeric',
}).format(deadline);
const time = new Intl.DateTimeFormat('en-US', {
  hour: 'numeric', timeZoneName: 'short',
}).format(deadline);
console.log(`My shoes in order-2001 say delivered, but they're missing. I'm going to a wedding on ${day} and need the shoes by ${time}. I wear a size 9 and can spend up to $99. I'd prefer formal black shoes with cushioning, but I'm open to something similar.`);
