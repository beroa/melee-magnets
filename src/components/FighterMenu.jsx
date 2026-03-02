export default function FighterMenu({
  selectedFighter,
  selectedCharacter,
  selectedState,
  characters,
  frameIndex,
  selectedFrameCount,
  activeFrames,
  onCharacterChange,
  onMoveChange,
  onFacingChange,
  onFrameChange
}) {
  if (!selectedFighter || !selectedCharacter || !selectedState) {
    return null;
  }

  return (
    <aside className="fighter-menu">
      <h2>{selectedFighter === "A" ? "Fighter A" : "Fighter B"}</h2>

      <label>
        Character
        <select
          value={selectedState.characterId}
          onChange={(event) => onCharacterChange(event.target.value)}
        >
          {characters.map((character) => (
            <option key={character.id} value={character.id}>
              {character.name}
            </option>
          ))}
        </select>
      </label>

      <label>
        Move
        <select
          value={selectedState.moveId || ""}
          onChange={(event) => onMoveChange(event.target.value)}
        >
          {(selectedCharacter.moves || []).map((move) => (
            <option key={move.id} value={move.id}>
              {move.name}
            </option>
          ))}
        </select>
      </label>

      <label>
        Facing
        <select value={selectedState.facing} onChange={(event) => onFacingChange(Number(event.target.value))}>
          <option value={1}>Right</option>
          <option value={-1}>Left</option>
        </select>
      </label>

      <label>
        Frame ({frameIndex + 1}/{selectedFrameCount})
        <input
          type="range"
          min="0"
          max={Math.max(0, selectedFrameCount - 1)}
          value={Math.min(frameIndex, selectedFrameCount - 1)}
          onChange={(event) => onFrameChange(Number(event.target.value))}
        />
      </label>

      <div className="frame-grid">
        {Array.from({ length: selectedFrameCount }, (_, index) => {
          const isActive = activeFrames.has(index);
          const isCurrent = index === frameIndex;

          return (
            <button
              key={`f-${index}`}
              type="button"
              className={`frame-btn ${isActive ? "active" : ""} ${isCurrent ? "current" : ""}`}
              onClick={() => onFrameChange(index)}
            >
              {index + 1}
            </button>
          );
        })}
      </div>

      <p className="legend">Green frame = at least one active hitbox.</p>
    </aside>
  );
}
