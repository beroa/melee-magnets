# Hitbox Visual QA Progress (2026-03-04)

Compared FightCore active-frame visuals against local display. No code changes were made during this pass.

## Samples checked

- Jigglypuff `jab1` frame 6
- Ness `jab2` frame 3
- Yoshi `jab2` frame 5
- Bowser `dashattack` frame 17
- Donkey Kong `dashattack` frame 18
- Captain Falcon `dsmash` frame 22
- Sheik `utilt` frame 5
- Sheik `jab2` frame 4
- Peach `dashattack` frame 15 (spot check)
- Dr. Mario `dsmash` frame 14 (spot check)
- Fox `fair` frame 20 (spot check)
- Fox `dair` frame 15 (spot check)

## Findings

1. Captain Falcon `dsmash` frame 22 appears incorrect locally.
   - FightCore shows a more extended/crouched sweep posture.
   - Local view stays too upright/compact around torso.

2. Dr. Mario `dsmash` frame 14 appears suspicious locally.
   - FightCore shows broader low sweep body coverage.
   - Local view appears compressed/less transformed.

3. Ness `jab2` frame 3 may have frame-index alignment drift.
   - FightCore frame appears near/no active bubble.
   - Local frame shows active hitboxes.
   - Could be a 1-frame indexing mismatch for some moves.

4. Airborne move comparisons are not fully apples-to-apples in current viewer.
   - Fox `fair`/`dair` checks are influenced by local ground-snap behavior while FightCore frames are airborne.
   - This is a display/QA context mismatch and not necessarily extraction data corruption.

## Overall status

- Most sampled grounded moves looked broadly consistent.
- Peach `dashattack` frame 15 looked good in this pass.
