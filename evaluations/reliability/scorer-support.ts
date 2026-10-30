import { config } from 'dotenv';
import { TypeSafeClient } from '@typesafe-ai/sdk';
import { z } from 'zod';
import { getJevConfig } from '../../packages/jev/setup.ts';
config({path:new URL('../../.env.local',import.meta.url),quiet:true});
export const jev = new TypeSafeClient(getJevConfig());
const answer=z.object({type:z.literal('choice'),choice:z.enum(['pass','fail','insufficient']),confidence:z.number().min(0).max(1),probabilities:z.object({pass:z.number().min(0).max(1),fail:z.number().min(0).max(1),insufficient:z.number().min(0).max(1)})}).superRefine((v,c)=>{
 if(Math.abs(Object.values(v.probabilities).reduce((a,b)=>a+b,0)-1)>.001)c.addIssue({code:'custom',message:'Invalid probability sum'});
 if(v.probabilities[v.choice]+.000001<Math.max(...Object.values(v.probabilities)))c.addIssue({code:'custom',message:'Invalid winning choice'});
});
export const schema=z.object({model:z.string(),answers:z.object({grounded:answer,next_step:answer}),usage:z.unknown()});

export type ScoringEvidence = Parameters<typeof jev.systemOne>[0]['state'];
