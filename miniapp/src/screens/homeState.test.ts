import { expect, it } from "vitest";
import { homeHero } from "./homeState";
import type { Quest, Team } from "../types";
const team:Team={id:'t',name:'Crew',status:'active',member_count:2};
const quest:Quest={id:'q',title:'Blue Mosque',description:'Public place',radius_m:100,base_xp:100,latitude:40,longitude:44,run:null};
const active={...quest,id:'a',run:{id:'r',status:'started' as const}};
const done={...quest,id:'d',run:{id:'d',status:'completed' as const}};
it.each([
 ['pending',{...team,status:'pending' as const},[active,quest,done]],
 ['no-team',null,[active,quest]],
 ['active',team,[quest,done,active]],
 ['available',team,[done,quest]],
 ['empty',team,[]],
 ['done',team,[done]],
] as const)('selects %s from API data',(kind,crew,quests)=>{expect(homeHero(crew,[...quests]).kind).toBe(kind);});
it('does not confuse loading or failed runs with empty or completed quests',()=>{
 expect(homeHero(team,null).kind).toBe('loading');expect(homeHero(team,[done,{...quest,run:{id:'f',status:'failed'}}]).kind).toBe('closed');
});
