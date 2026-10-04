import { rawFrames } from './ffmpeg.ts';
const [video, fs, cs] = process.argv.slice(2);
const [x,y,w,h] = cs!.split(',').map(Number);
const args=['-v','error','-i',video!,'-vf',`select='eq(n\,${fs})',crop=${w}:${h}:${x}:${y}`,'-fps_mode','passthrough','-f','rawvideo','-pix_fmt','rgb24','-'];
for await (const b of rawFrames(args,w!*h!*3)){ for(let r=0;r<h!;r++){let s='';for(let c=0;c<w!;c++){const i=(r*w!+c)*3;const v=process.env.CH==="max"?Math.max(b[i]!,b[i+1]!,b[i+2]!):Math.min(b[i]!,b[i+1]!,b[i+2]!);s+=v>200?'#':v>150?'+':v>90?'.':' ';}console.log(String(r).padStart(2),s);} }
