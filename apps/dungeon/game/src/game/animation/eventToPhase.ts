import type { GameEvent } from '@org/shared';

export type Phase = 'action' | 'impact' | 'consequence' | 'cleanup';
export type PhaseOrSkip = Phase | 'skip';

export const EVENT_PHASE: Record<GameEvent['type'], PhaseOrSkip> = {
  move:                     'action',
  item_activate:            'action',
  slot_switched:            'action',
  interacted:               'action',
  item_interact_tile:       'action',

  attack:                   'impact',
  collision_attack:         'impact',
  item_hit:                 'impact',
  item_whiff:               'impact',
  item_fail:                'impact',
  mine_placed:              'impact',
  mine_detonated:           'impact',
  explosion:                'impact',
  explosion_wall_destroyed: 'impact',
  explosion_entity_damage:  'impact',

  fire_damage:              'consequence',
  fire_spread:              'consequence',
  oil_ignited:              'consequence',
  tile_changed:             'consequence',
  mechanism_solved:         'consequence',
  mechanism_reset:          'consequence',
  death:                    'consequence',

  pickup:                   'cleanup',
  room_transition:          'skip',
  run_end:                  'skip',
  noop:                     'skip',
  player_action:            'skip',
  run_start:                'skip',
};
