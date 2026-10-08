import { z } from 'zod';
// ISO weekdays: Monday=1 … Sunday=7. Opening periods are clinic-local wall-clock times.
export const weekdays=['1','2','3','4','5','6','7'] as const;
export const weekdayLabels:Record<typeof weekdays[number],string>={'1':'Monday','2':'Tuesday','3':'Wednesday','4':'Thursday','5':'Friday','6':'Saturday','7':'Sunday'};
export const slotLengths=[5,10,15,20,30,60] as const;
export const resourceColors=['#185d55','#6784a7','#b0703c','#8a5a9e','#3f7f3a','#a8434d','#4f6d7a','#9a8a2e'] as const;
export const clockMinutes=(value:string)=>Number(value.slice(0,2))*60+Number(value.slice(3,5));
const clock=z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
const period=z.tuple([clock,clock]).refine(([opens,closes])=>clockMinutes(closes)>clockMinutes(opens),'Closing time must be after opening time.');
const day=z.array(period).max(4).refine(list=>list.every((value,i)=>i===0||clockMinutes(value[0])>=clockMinutes(list[i-1][1])),'Opening periods must be in order and must not overlap.');
export const weeklyHoursSchema=z.object(Object.fromEntries(weekdays.map(d=>[d,day])) as Record<typeof weekdays[number],typeof day>).strict();
export type WeeklyHours=z.infer<typeof weeklyHoursSchema>;
export const emptyWeek:WeeklyHours={'1':[],'2':[],'3':[],'4':[],'5':[],'6':[],'7':[]};
const name=z.string().trim().min(2).max(80);
const operationId=z.uuid();const expectedVersion=z.number().int().positive();
export const createResourceInput=z.discriminatedUnion('kind',[
 z.object({kind:z.literal('dentist'),operationId,name,color:z.enum(resourceColors),membershipId:z.uuid().nullable().default(null)}).strict(),
 z.object({kind:z.literal('chair'),operationId,name}).strict(),
]);
export const updateResourceInput=z.discriminatedUnion('kind',[
 z.object({kind:z.literal('dentist'),operationId,expectedVersion,name,color:z.enum(resourceColors),membershipId:z.uuid().nullable(),active:z.boolean()}).strict(),
 z.object({kind:z.literal('chair'),operationId,expectedVersion,name,active:z.boolean()}).strict(),
]);
export const hoursInput=z.object({operationId,expectedVersion:z.number().int().min(0),slotMinutes:z.number().int().refine(v=>(slotLengths as readonly number[]).includes(v)),weeklyHours:weeklyHoursSchema}).strict();
export const closureInput=z.object({operationId,closedOn:z.iso.date(),reason:z.string().trim().min(3).max(200)}).strict();
export const closureCancelInput=z.object({operationId,expectedVersion}).strict();
// Wall-clock date, ISO weekday and minute-of-day of an instant in the clinic timezone.
export function localParts(timezone:string,instant:Date){
 const parts=new Intl.DateTimeFormat('en-GB',{timeZone:timezone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',weekday:'short',hourCycle:'h23'}).formatToParts(instant);
 const get=(type:string)=>parts.find(p=>p.type===type)?.value??'';
 return {date:`${get('year')}-${get('month')}-${get('day')}`,weekday:String(['Mon','Tue','Wed','Thu','Fri','Sat','Sun'].indexOf(get('weekday'))+1) as typeof weekdays[number],minute:Number(get('hour'))*60+Number(get('minute'))};
}
export type OpeningResult='open'|'not_configured'|'closed_date'|'outside_hours';
// A booking must fit entirely inside one opening period on a single local date. Unconfigured branches are not restricted.
export function openingCheck(hours:WeeklyHours|null,closedDates:ReadonlySet<string>,timezone:string,startsAt:Date,endsAt:Date):OpeningResult{
 const start=localParts(timezone,startsAt);if(closedDates.has(start.date))return 'closed_date';if(!hours)return 'not_configured';
 const end=localParts(timezone,endsAt);if(end.date!==start.date)return 'outside_hours';
 return hours[start.weekday].some(([opens,closes])=>start.minute>=clockMinutes(opens)&&end.minute<=clockMinutes(closes))?'open':'outside_hours';
}
// UTC offset (minutes) of a timezone at an instant, e.g. +300 for Asia/Karachi.
export function offsetMinutes(timezone:string,instant:Date){
 const name=new Intl.DateTimeFormat('en-US',{timeZone:timezone,timeZoneName:'longOffset'}).formatToParts(instant).find(p=>p.type==='timeZoneName')?.value??'GMT';
 const m=/GMT([+-])(\d{2}):?(\d{2})?/.exec(name);return m?(m[1]==='-'?-1:1)*(Number(m[2])*60+Number(m[3]??0)):0;
}
// The instant at which the clinic's wall clock shows this date and time.
export function zonedInstant(timezone:string,date:string,time:string){
 const [y,mo,d]=date.split('-').map(Number);const [h,mi]=time.split(':').map(Number);const guess=Date.UTC(y,mo-1,d,h,mi);
 const first=guess-offsetMinutes(timezone,new Date(guess))*60000;return new Date(guess-offsetMinutes(timezone,new Date(first))*60000);
}
export const addDays=(date:string,days:number)=>new Date(Date.parse(`${date}T00:00:00Z`)+days*86400000).toISOString().slice(0,10);
export const weekStart=(date:string)=>addDays(date,-((new Date(`${date}T00:00:00Z`).getUTCDay()+6)%7));
export const minutesToClock=(minutes:number)=>`${String(Math.floor(minutes/60)).padStart(2,'0')}:${String(minutes%60).padStart(2,'0')}`;
export const clockOf=(timezone:string,instant:Date|string)=>new Intl.DateTimeFormat('en-GB',{timeZone:timezone,hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(new Date(instant));
