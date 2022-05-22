import OmeggaPlugin, { OL, PS, PC, ILogMinigame, OmeggaPlayer } from 'omegga';

type Config = { foo: string };
type Storage = { bar: string };
type Plr_Store = 
{
  saved_checkpoints: 
  {
    minigame: string,
    teams: {teamname: string, color: number[], pos: number[]}[]
  }[]
}

export default class Plugin implements OmeggaPlugin<Config, Storage> {
  omegga: OL;
  config: PC<Config>;
  store: PS<Storage>;
  constructor(omegga: OL, config: PC<Config>, store: PS<Storage>) {
    this.omegga = omegga;
    this.config = config;
    this.store = store; 
  }

  async init() {
    this.debug = this.config["Enable-Debug"];
    this.auth = this.config["Authorized-Users"];
    const minigame_events = await this.omegga.getPlugin("minigameevents");
    if (minigame_events) {
      console.log('subscribing to minigameevents');
      minigame_events.emitPlugin('subscribe', []);
    } else throw Error("minigameevents plugin is required for this to plugin");

    this.omegga.on('cmd:forgetcheckpoint', async (speaker: string) => // WIP
    {
      let store_obj: Plr_Store = await this.store.get<any>(`p-${speaker}`) || undefined;
      if (!store_obj) {if (this.debug) this.omegga.broadcast("couldnt find store at forgetcheckpoint"); return;}
      let mini = this.find_mini_by_player(speaker);

    });
    this.omegga.on('cmd:forgetallcheckpoints', async (speaker: string) => // WIP
    {
      await this.store.delete(`p-${speaker}`);
      this.omegga.whisper(speaker, "Cleared all saved checkpoints");
    });
    this.omegga.on('cmd:persistentcheckpointsclearstore', async (speaker: string) =>
    {
      //if (!this.auth.find(p => p === speaker)) {this.omegga.whisper(speaker, "not auth'd"); return;}

      await this.store.wipe();
      this.omegga.broadcast("cleared all store");
    });
    this.omegga.on('cmd:persistentcheckpointslog', async (speaker: string) =>
    {
      //if (!this.auth.find(p => p === speaker)) {this.omegga.whisper(speaker, "not auth'd"); return;}

      let store_obj: Plr_Store = await this.store.get<any>(`p-${speaker}`)
      console.log(JSON.stringify(store_obj))
    });

    this.omegga.on('interact', async (object) => 
    {
      if (object.brick_asset !== "B_CheckPoint") return;
      let store_obj: Plr_Store = await this.store.get<any>(`p-${object.player.name}`) || undefined;
      if (!store_obj) {if (this.debug) this.omegga.broadcast("couldnt find store at interact"); return;}

      let mini = this.find_mini_by_player(object.player.name);
      if (mini.name === "GLOBAL") return;

      let team = this.find_team_by_player(object.player.name);
      if (!mini || !team) {if (this.debug) this.omegga.broadcast("couldnt find mini or team at interact"); return;}

      if (store_obj.saved_checkpoints.find(m => m.minigame === mini.name)) 
      {
        store_obj.saved_checkpoints.find(s => s.minigame === mini.name).teams.find(t => t.teamname === team.name).pos = object.position;
        this.omegga.whisper(object.player.name, `<size="16">Saved checkpoint</>`);
      } else 
      {
        store_obj.saved_checkpoints.push({minigame: mini.name, teams: mini.teams.map(t => ({teamname: t.name, color: t.color, pos: [0,0,0]}))});
      }
      await this.store.set<any>(`p-${object.player.name}`, store_obj);
    });
    
    return { registeredCommands: ['forgetcheckpoint','forgetallcheckpoints','persistentcheckpointsclearstore','persistentcheckpointslog'] };
  }

  debug: boolean = false;
  auth: string[] = [];
  minigame_cache: ILogMinigame[] = [];
  
  async minigame_join_function(player: OmeggaPlayer, minigame) // adds or updates a minigame in the player store ALSO ONLY COUNTS ONE MINI
  {
    if (this.debug) this.omegga.broadcast("ran minigame_join_function");

    let store_obj: Plr_Store = await this.store.get<any>(`p-${player.name}`) || undefined;
    if (!store_obj) 
    {
      if (this.debug) this.omegga.broadcast("couldnt find store at minigame_join_function, creating");
      let empty_obj: Plr_Store = {saved_checkpoints: []};
      await this.store.set<any>(`p-${player.name}`, empty_obj);
      return;
    }

    this.minigame_cache = await this.omegga.getMinigames(); // necessary to update in real time

    let team = this.find_team_by_player(player.name);
    if (!team) {if (this.debug) this.omegga.broadcast("couldnt find team in minigame_join_function"); return;}

    let obj = store_obj.saved_checkpoints.find(s => s.minigame === minigame.name) || undefined;
    if (!obj)
    {
      let mini = this.find_mini_by_mini_lol(minigame.name);
      store_obj.saved_checkpoints.push({ minigame: minigame.name, teams: mini.teams.map(t => ({teamname: t.name, color: t.color, pos: [0,0,0]})) })
      obj = store_obj.saved_checkpoints.find(s => s.minigame === minigame.name) || undefined;
      return;
    }

    // tp player to saved checkpoint
    setTimeout(() => 
    {
      let pos: number[] = obj.teams.find(t => t.teamname === team.name).pos;
      this.omegga.writeln(`Chat.Command /TP "${player.name}" ${pos[0]} ${pos[1]} ${pos[2]+ 50} 0`);
      this.omegga.whisper(player.name, `<size="22"><color="5f5">Returned to previous checkpoint</></>`);
      this.omegga.whisper(player.name, `<size="16"><color="5ff">To be safe, remember to re-activate the checkpoint under you!</></>`);
    }, 200)
  }


  async pluginEvent(event: string, from: string, ...args: any[]) {
    const [{ name, player, minigame, leaderboard }] = args; //name = mini's name, player = OmeggaPlayer, minigame = weird, leaderboard = idk
    switch(event) 
    {
      case 'roundend': // name
        break;
      case 'roundchange': // name
        break;
      case 'joinminigame': // player, minigame
        if (player && minigame) {
          if (minigame.name === "GLOBAL") return;
          await this.minigame_join_function(player, minigame);
        }
        break;
      case 'leaveminigame': // player, minigame
        break;
      case 'leaderboardchange': // player, leaderboard
        break;
      case 'score': // player, leaderboard
        break;
      case 'kill': // player, leaderboard
        break;
      case 'death': // player, leaderboard
        break;
    }
  }

  find_mini_by_mini_lol(mini_name: string) 
  {
    return this.minigame_cache.find(m => m.name === mini_name) || undefined;
  }

  find_mini_by_player(plr_name: string) 
  {
    return this.minigame_cache.find(m => m.teams.find(t => t.members.find(p => p.name === plr_name))) || undefined;
  }
  
  find_team_by_player(plr_name: string) 
  {
    let mini = this.find_mini_by_player(plr_name) || undefined;
    if (mini) 
    {
      return  mini.teams.find(t => t.members.find(p => p.name === plr_name)) || undefined;
    } else return undefined;
  }

  async stop() 
  {
    const minigameEvents = await this.omegga.getPlugin('minigameevents');
    if (minigameEvents) {
      console.log('unsubscribing from minigameevents');
      minigameEvents.emitPlugin('unsubscribe', []);
    } else throw Error("minigameevents plugin is required for this to plugin");
  }
}