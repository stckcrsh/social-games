import { describe, it, expect } from 'vitest';
import { parseTmxObjects } from './tmx-loader.js';

const MINIMAL_TMX = `<?xml version="1.0" encoding="UTF-8"?>
<map version="1.10" orientation="isometric" width="10" height="10"
     tilewidth="256" tileheight="128">
 <objectgroup name="spawns">
  <object id="1" name="default">
   <properties>
    <property name="gridX" type="int" value="1"/>
    <property name="gridY" type="int" value="2"/>
   </properties>
   <point/>
  </object>
 </objectgroup>
 <objectgroup name="extract">
  <object id="2" name="extract">
   <properties>
    <property name="gridX" type="int" value="8"/>
    <property name="gridY" type="int" value="8"/>
   </properties>
   <point/>
  </object>
 </objectgroup>
 <objectgroup name="triggers">
  <object id="3" name="lever-a">
   <properties>
    <property name="gridX" type="int" value="4"/>
    <property name="gridY" type="int" value="4"/>
    <property name="interactableKind" value="lever"/>
    <property name="label" value="Lever A"/>
    <property name="stateCount" type="int" value="2"/>
   </properties>
   <point/>
  </object>
 </objectgroup>
 <objectgroup name="enemies">
  <object id="4" name="enemy-1">
   <properties>
    <property name="gridX" type="int" value="5"/>
    <property name="gridY" type="int" value="5"/>
    <property name="aiType" value="chase_astar"/>
    <property name="hp" type="int" value="15"/>
    <property name="attackDamage" type="int" value="4"/>
    <property name="aggroRange" type="int" value="8"/>
   </properties>
   <point/>
  </object>
 </objectgroup>
 <objectgroup name="portals">
  <object id="5" name="exit-north" type="map_exit">
   <properties>
    <property name="gridX" type="int" value="9"/>
    <property name="gridY" type="int" value="0"/>
    <property name="targetMapId" value="room-b"/>
    <property name="targetEnterId" value="enter-from-a"/>
   </properties>
   <point/>
  </object>
  <object id="6" name="enter-from-b" type="map_enter">
   <properties>
    <property name="gridX" type="int" value="0"/>
    <property name="gridY" type="int" value="9"/>
   </properties>
   <point/>
  </object>
 </objectgroup>
</map>`;

describe('parseTmxObjects', () => {
  it('parses spawn points', () => {
    const data = parseTmxObjects(MINIMAL_TMX);
    expect(data.spawns).toHaveLength(1);
    expect(data.spawns[0]).toEqual({ name: 'default', pos: { x: 1, y: 2 } });
  });

  it('parses extract point', () => {
    const data = parseTmxObjects(MINIMAL_TMX);
    expect(data.extract).toEqual({ x: 8, y: 8 });
  });

  it('parses trigger points', () => {
    const data = parseTmxObjects(MINIMAL_TMX);
    expect(data.triggers).toHaveLength(1);
    expect(data.triggers[0]).toMatchObject({
      name: 'lever-a',
      pos: { x: 4, y: 4 },
      interactableKind: 'lever',
      label: 'Lever A',
      stateCount: 2,
    });
  });

  it('parses enemies', () => {
    const data = parseTmxObjects(MINIMAL_TMX);
    expect(data.enemies).toHaveLength(1);
    expect(data.enemies[0]).toMatchObject({
      name: 'enemy-1',
      pos: { x: 5, y: 5 },
      aiType: 'chase_astar',
      hp: 15,
      attackDamage: 4,
      aggroRange: 8,
    });
  });

  it('parses portal exits and enters', () => {
    const data = parseTmxObjects(MINIMAL_TMX);
    expect(data.exits).toHaveLength(1);
    expect(data.exits[0]).toMatchObject({
      name: 'exit-north',
      pos: { x: 9, y: 0 },
      targetMapId: 'room-b',
      targetEnterId: 'enter-from-a',
    });
    expect(data.enters).toHaveLength(1);
    expect(data.enters[0]).toMatchObject({ name: 'enter-from-b', pos: { x: 0, y: 9 } });
  });

  it('builds nameIndex from all named objects', () => {
    const data = parseTmxObjects(MINIMAL_TMX);
    expect(data.nameIndex['lever-a']).toEqual({ x: 4, y: 4 });
    expect(data.nameIndex['exit-north']).toEqual({ x: 9, y: 0 });
  });
});
