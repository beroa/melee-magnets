using System.Text.Json;
using System.Text.Json.Serialization;
using HSDRaw;
using HSDRaw.Common;
using HSDRaw.Common.Animation;
using HSDRaw.Melee.Pl;
using HSDRaw.Tools;
using HSDRaw.Tools.Melee;
using OpenTK.Mathematics;

namespace hurtbox_cache_extractor;

internal sealed class Program
{
    private static readonly CharacterInfo[] Characters =
    {
        new("Kp", "Bowser"),
        new("Ca", "Captain Falcon"),
        new("Dk", "Donkey Kong"),
        new("Dr", "Dr Mario"),
        new("Fc", "Falco"),
        new("Fx", "Fox"),
        new("Gw", "Game & Watch"),
        new("Gn", "Ganondorf"),
        new("Nn", "Ice Climbers - Nana"),
        new("Pp", "Ice Climbers - Popo"),
        new("Pr", "Jigglypuff"),
        new("Kb", "Kirby"),
        new("Lk", "Link"),
        new("Lg", "Luigi"),
        new("Mr", "Mario"),
        new("Ms", "Marth"),
        new("Mt", "Mewtwo"),
        new("Ns", "Ness"),
        new("Pe", "Peach"),
        new("Pc", "Pichu"),
        new("Pk", "Pikachu"),
        new("Fe", "Roy"),
        new("Ss", "Samus"),
        new("Sk", "Sheik"),
        new("Ys", "Yoshi"),
        new("Cl", "Young Link"),
        new("Zd", "Zelda")
    };

    private static readonly JsonSerializerOptions ReadOptions = new()
    {
        PropertyNameCaseInsensitive = true
    };

    private static readonly JsonSerializerOptions WriteOptions = new()
    {
        WriteIndented = false,
        DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull
    };

    private const float Epsilon = 0.000001f;
    private const int PoseFrameOffset = 1;

    private static int Main(string[] args)
    {
        try
        {
            var options = Options.Parse(args);
            Run(options);
            return 0;
        }
        catch (Exception ex)
        {
            Console.Error.WriteLine($"error: {ex.Message}");
            return 1;
        }
    }

    private static void Run(Options options)
    {
        Directory.CreateDirectory(options.OutDir);

        var processed = 0;
        var skipped = 0;

        foreach (var character in Characters)
        {
            if (!options.MatchesCharacter(character))
            {
                continue;
            }

            try
            {
                if (ProcessCharacter(options, character))
                {
                    processed += 1;
                }
                else
                {
                    skipped += 1;
                }
            }
            catch (Exception ex)
            {
                Console.Error.WriteLine($"skip {character.Name}: {ex.Message}");
                skipped += 1;
            }
        }

        Console.WriteLine($"processed characters: {processed}");
        Console.WriteLine($"skipped characters:   {skipped}");
        Console.WriteLine($"output dir:           {options.OutDir}");
    }

    private static bool ProcessCharacter(Options options, CharacterInfo character)
    {
        var fileStem = CharacterFileStem(character.Name);
        var fighterDataPath = Path.Combine(options.CleanDatsDir, $"Pl{character.Code}.dat");
        var animationPath = Path.Combine(options.CleanDatsDir, $"Pl{character.Code}AJ.dat");
        var framedataPath = Path.Combine(options.FramedataDir, $"{fileStem}.framedata.json");
        var datasetsDir = Path.GetDirectoryName(options.FramedataDir) ?? options.FramedataDir;
        var datDumpPath = Path.Combine(datasetsDir, "dat-dumps", $"{fileStem}.json");
        var modelPath = ResolveModelDatPath(options.ModelDatsDir, character.Code);

        if (!File.Exists(fighterDataPath))
        {
            Console.Error.WriteLine($"skip {character.Name}: missing fighter dat ({fighterDataPath})");
            return false;
        }

        if (!File.Exists(animationPath))
        {
            Console.Error.WriteLine($"skip {character.Name}: missing animation dat ({animationPath})");
            return false;
        }

        if (!File.Exists(framedataPath))
        {
            Console.Error.WriteLine($"skip {character.Name}: missing framedata ({framedataPath})");
            return false;
        }

        if (string.IsNullOrEmpty(modelPath) || !File.Exists(modelPath))
        {
            Console.Error.WriteLine($"skip {character.Name}: missing model dat (Pl{character.Code}*.dat)");
            return false;
        }

        var fighterDataFile = new HSDRawFile(fighterDataPath);
        if (fighterDataFile.Roots.Count == 0 || fighterDataFile.Roots[0].Data is not SBM_FighterData fighterData)
        {
            throw new InvalidOperationException($"unable to parse fighter data from {fighterDataPath}");
        }
        var modelScale = ReadModelScale(fighterData);

        var modelFile = new HSDRawFile(modelPath);
        if (modelFile.Roots.Count == 0 || modelFile.Roots[0].Data is not HSD_JOBJ modelRoot)
        {
            throw new InvalidOperationException($"unable to parse model root from {modelPath}");
        }

        var ajManager = new FighterAJManager(File.ReadAllBytes(animationPath));
        var animationsByName = new Dictionary<string, HSD_FigaTree>(StringComparer.Ordinal);
        foreach (var symbol in ajManager.GetAnimationSymbols())
        {
            var data = ajManager.GetAnimationData(symbol);
            if (data == null || data.Length == 0)
            {
                continue;
            }

            var animationDat = new HSDRawFile(data);
            if (animationDat.Roots.Count == 0 || animationDat.Roots[0].Data is not HSD_FigaTree tree)
            {
                continue;
            }

            var name = NormalizeSymbol(animationDat.Roots[0].Name);
            if (string.IsNullOrWhiteSpace(name))
            {
                name = NormalizeSymbol(symbol);
            }

            if (string.IsNullOrWhiteSpace(name) || animationsByName.ContainsKey(name))
            {
                continue;
            }

            animationsByName[name] = tree;
        }

        if (animationsByName.Count == 0)
        {
            throw new InvalidOperationException($"no figatree animations found in {animationPath}");
        }

        var hurtboxes = fighterData.Hurtboxes?.Hurtboxes ?? Array.Empty<SBM_Hurtbox>();
        if (hurtboxes.Length == 0)
        {
            throw new InvalidOperationException($"fighter hurtbox bank is empty in {fighterDataPath}");
        }
        var joints = BuildJointTemplates(modelRoot);
        if (joints.Count == 0)
        {
            throw new InvalidOperationException($"model has no joints: {modelPath}");
        }

        var framedataJson = File.ReadAllText(framedataPath);
        var moves = JsonSerializer.Deserialize<Dictionary<string, MoveData>>(framedataJson, ReadOptions) ??
                    new Dictionary<string, MoveData>(StringComparer.Ordinal);
        DatDumpRoot? datDump = null;
        if (File.Exists(datDumpPath))
        {
            try
            {
                datDump = JsonSerializer.Deserialize<DatDumpRoot>(File.ReadAllText(datDumpPath), ReadOptions);
            }
            catch
            {
                datDump = null;
            }
        }

        var poseCacheBySubaction = new Dictionary<string, PoseComputer>(StringComparer.Ordinal);
        var moveCache = new Dictionary<string, MoveCache>(StringComparer.Ordinal);

        var matchedSubactions = 0;
        var missingSubactions = 0;

        foreach (var (moveId, moveData) in moves)
        {
            if (moveData == null)
            {
                continue;
            }

            var frameCount = Math.Max(1, (int)MathF.Round(moveData.totalFrames <= 0 ? 1 : moveData.totalFrames));
            var subactionName = NormalizeSymbol(moveData.subactionName);

            var moveCacheEntry = new MoveCache
            {
                subactionName = subactionName,
                frameCount = frameCount,
                frames = new List<FrameCache>(frameCount)
            };

            PoseComputer? poseComputer = null;
            if (!string.IsNullOrWhiteSpace(subactionName) && animationsByName.TryGetValue(subactionName, out var tree))
            {
                matchedSubactions += 1;
                if (!poseCacheBySubaction.TryGetValue(subactionName, out poseComputer))
                {
                    poseComputer = new PoseComputer(tree, joints);
                    poseCacheBySubaction[subactionName] = poseComputer;
                }
            }
            else if (!string.IsNullOrWhiteSpace(subactionName))
            {
                missingSubactions += 1;
            }

            var hitboxesByFrame =
                TryBuildFrameHitboxMapFromSubactionEvents(datDump, moveData.subactionIndex, frameCount) ??
                BuildFrameHitboxMap(moveData.hitFrames, frameCount);

            for (var frameIndex = 0; frameIndex < frameCount; frameIndex += 1)
            {
                var worldTransforms = poseComputer?.GetWorldTransforms(frameIndex + PoseFrameOffset);

                var frameCache = new FrameCache
                {
                    hurtboxes =
                        worldTransforms == null
                            ? new List<HurtboxFrame>(0)
                            : TransformHurtboxes(
                                hurtboxes,
                                joints,
                                worldTransforms,
                                modelScale),
                    hitboxes =
                        worldTransforms != null && hitboxesByFrame.TryGetValue(frameIndex, out var activeHitboxes)
                            ? TransformHitboxes(
                                ApplyKnownHitboxCorrections(character, moveId, activeHitboxes),
                                joints,
                                worldTransforms,
                                modelScale)
                            : new List<HitboxFrame>(0)
                };

                moveCacheEntry.frames.Add(frameCache);
            }

            moveCache[moveId] = moveCacheEntry;
        }

        var characterCache = new CharacterCache
        {
            character = character.Name,
            code = character.Code,
            modelScale = modelScale,
            generatedAt = DateTimeOffset.UtcNow.ToString("O"),
            moves = moveCache
        };

        var outputPath = Path.Combine(options.OutDir, $"{fileStem}.realboxes.json");
        var outputJson = JsonSerializer.Serialize(characterCache, WriteOptions);
        File.WriteAllText(outputPath, outputJson);

        Console.WriteLine($"build real boxes: {character.Name} (matched {matchedSubactions}, missing {missingSubactions})");
        return true;
    }

    private static List<HitboxLocal> BuildHitboxWindow(HitFrameWindow? window)
    {
        if (window?.hitboxes == null || window.hitboxes.Count == 0)
        {
            return new List<HitboxLocal>(0);
        }

        return window.hitboxes
            .Where(hitbox => hitbox != null)
            .Select(hitbox => new HitboxLocal
            {
                id = hitbox.id,
                bone = hitbox.bone,
                damage = hitbox.damage,
                angle = hitbox.angle,
                size = hitbox.size,
                x = hitbox.x,
                y = hitbox.y,
                z = hitbox.z,
                element = hitbox.element ?? "normal",
                groupId = hitbox.groupId,
                guid = hitbox.guid
            })
            .ToList();
    }

    private static Dictionary<int, List<HitboxLocal>> BuildFrameHitboxMap(List<HitFrameWindow>? windows, int frameCount)
    {
        var map = new Dictionary<int, List<HitboxLocal>>();
        if (windows == null || windows.Count == 0)
        {
            return map;
        }

        foreach (var window in windows)
        {
            var hitboxes = BuildHitboxWindow(window);
            if (hitboxes.Count == 0)
            {
                continue;
            }

            var start = OneBasedFrameToIndex(window.start, frameCount);
            var end = OneBasedFrameToIndex(window.end, frameCount);
            if (end < start)
            {
                (start, end) = (end, start);
            }

            for (var frameIndex = start; frameIndex <= end; frameIndex += 1)
            {
                if (!map.TryGetValue(frameIndex, out var active))
                {
                    active = new List<HitboxLocal>();
                    map[frameIndex] = active;
                }

                active.AddRange(hitboxes);
            }
        }

        return map;
    }

    private static Dictionary<int, List<HitboxLocal>>? TryBuildFrameHitboxMapFromSubactionEvents(
        DatDumpRoot? datDump,
        int subactionIndex,
        int frameCount)
    {
        var events = datDump?.nodes?.FirstOrDefault()?.data?.subactions;
        if (events == null || subactionIndex < 0 || subactionIndex >= events.Count)
        {
            return null;
        }

        var scriptEvents = events[subactionIndex]?.events;
        if (scriptEvents == null || scriptEvents.Count == 0)
        {
            return null;
        }

        var frameMap = new Dictionary<int, List<HitboxLocal>>();
        var activeHitboxes = new Dictionary<int, HitboxLocal>();
        var cursorFrame = 1;
        var parsedAnyCommand = false;

        void EmitUntil(int targetExclusive)
        {
            var end = Math.Clamp(targetExclusive, 1, frameCount + 1);
            for (var frame = cursorFrame; frame < end; frame += 1)
            {
                frameMap[frame - 1] = activeHitboxes.Values
                    .OrderBy(hitbox => hitbox.id)
                    .Select(CloneHitbox)
                    .ToList();
            }

            cursorFrame = end;
        }

        foreach (var scriptEvent in scriptEvents)
        {
            var name = scriptEvent?.name ?? "";
            var fields = scriptEvent?.fields;
            if (string.Equals(name, "waitUntil", StringComparison.OrdinalIgnoreCase) &&
                fields?.frame is int waitUntilFrame)
            {
                EmitUntil(waitUntilFrame);
                continue;
            }

            if (string.Equals(name, "waitFor", StringComparison.OrdinalIgnoreCase))
            {
                var waitFrames = Math.Max(0, fields?.frames ?? 0);
                EmitUntil(cursorFrame + waitFrames);
                continue;
            }

            if (cursorFrame < 1 || cursorFrame > frameCount)
            {
                continue;
            }

            if (string.Equals(name, "hitbox", StringComparison.OrdinalIgnoreCase))
            {
                var parsed = ParseHitboxFromEvent(fields);
                if (parsed != null)
                {
                    activeHitboxes[parsed.id] = parsed;
                    parsedAnyCommand = true;
                }

                continue;
            }

            if (string.Equals(name, "endOneCollision", StringComparison.OrdinalIgnoreCase))
            {
                if (fields?.hitboxId is int hitboxId)
                {
                    activeHitboxes.Remove(hitboxId);
                    parsedAnyCommand = true;
                }

                continue;
            }

            if (string.Equals(name, "endAllCollisions", StringComparison.OrdinalIgnoreCase))
            {
                activeHitboxes.Clear();
                parsedAnyCommand = true;
            }
        }

        EmitUntil(frameCount + 1);
        return parsedAnyCommand ? frameMap : null;
    }

    private static List<HitboxLocal> ApplyKnownHitboxCorrections(
        CharacterInfo character,
        string moveId,
        IReadOnlyList<HitboxLocal> hitboxes)
    {
        var corrected = hitboxes.Select(CloneHitbox).ToList();

        if (!string.Equals(character.Code, "Pe", StringComparison.OrdinalIgnoreCase) ||
            !string.Equals(moveId, "dashattack", StringComparison.OrdinalIgnoreCase))
        {
            return corrected;
        }

        var handBone =
            corrected.FirstOrDefault(hitbox => hitbox.id == 0 && hitbox.bone > 0)?.bone ??
            87;

        foreach (var hitbox in corrected)
        {
            if (hitbox.id == 1 && hitbox.bone == 0)
            {
                hitbox.bone = handBone;
            }
        }

        return corrected;
    }

    private static HitboxLocal CloneHitbox(HitboxLocal hitbox)
    {
        return new HitboxLocal
        {
            id = hitbox.id,
            bone = hitbox.bone,
            damage = hitbox.damage,
            size = hitbox.size,
            x = hitbox.x,
            y = hitbox.y,
            z = hitbox.z,
            angle = hitbox.angle,
            element = hitbox.element,
            groupId = hitbox.groupId,
            guid = hitbox.guid
        };
    }

    private static HitboxLocal? ParseHitboxFromEvent(HitboxEventFields? fields)
    {
        if (fields == null || fields.id == null)
        {
            return null;
        }

        var id = fields.id.Value;
        return new HitboxLocal
        {
            id = id,
            bone = fields.bone ?? 0,
            damage = fields.damage ?? 0,
            size = fields.size ?? 0,
            x = fields.x ?? 0,
            y = fields.y ?? 0,
            z = fields.z ?? 0,
            angle = fields.angle ?? 0,
            element = fields.element ?? "normal",
            groupId = fields.groupId ?? id,
            guid = fields.guid ?? id
        };
    }

    private static int OneBasedFrameToIndex(int value, int frameCount)
    {
        var index = value <= 0 ? 0 : value - 1;
        if (index < 0)
        {
            return 0;
        }

        if (index >= frameCount)
        {
            return frameCount - 1;
        }

        return index;
    }

    private static List<HurtboxFrame> TransformHurtboxes(
        IReadOnlyList<SBM_Hurtbox> source,
        IReadOnlyList<JointTemplate> joints,
        IReadOnlyList<Matrix4> worldTransforms,
        float modelScale)
    {
        var transformed = new List<HurtboxFrame>(source.Count);

        for (var i = 0; i < source.Count; i += 1)
        {
            var hurtbox = source[i];
            if (hurtbox == null)
            {
                continue;
            }

            var bone = ResolveBoneIndex(hurtbox.BoneIndex, joints);
            if (bone < 0 || bone >= worldTransforms.Count)
            {
                continue;
            }

            var transform = worldTransforms[bone];
            var p1 = Vector3.TransformPosition(new Vector3(hurtbox.X1, hurtbox.Y1, hurtbox.Z1), transform);
            var p2 = Vector3.TransformPosition(new Vector3(hurtbox.X2, hurtbox.Y2, hurtbox.Z2), transform);
            p1 *= modelScale;
            p2 *= modelScale;

            transformed.Add(new HurtboxFrame
            {
                id = i.ToString(),
                bone = bone,
                type = hurtbox.Type.ToString().ToLowerInvariant(),
                grabbable = hurtbox.Grabbable != 0,
                x = (p1.Z + p2.Z) * 0.5f,
                y = (p1.Y + p2.Y) * 0.5f,
                x1 = p1.Z,
                y1 = p1.Y,
                x2 = p2.Z,
                y2 = p2.Y,
                radius = hurtbox.Size * modelScale
            });
        }

        return transformed;
    }

    private static List<HitboxFrame> TransformHitboxes(
        IReadOnlyList<HitboxLocal> localHitboxes,
        IReadOnlyList<JointTemplate> joints,
        IReadOnlyList<Matrix4> worldTransforms,
        float modelScale)
    {
        var transformed = new List<HitboxFrame>(localHitboxes.Count);

        foreach (var hitbox in localHitboxes)
        {
            var bone = ResolveBoneIndex(hitbox.bone, joints);
            if (bone < 0 || bone >= worldTransforms.Count)
            {
                continue;
            }

            var transform = worldTransforms[bone];
            // Framedata hitbox coordinates are authored in script space where `x`
            // corresponds to side-view horizontal in-game. Our renderer projects
            // world Z as horizontal, so we map script x -> model Z here.
            var localPoint = new Vector3((float)hitbox.z, (float)hitbox.y, (float)hitbox.x);
            var worldPoint = Vector3.TransformPosition(localPoint, transform);
            worldPoint *= modelScale;

            transformed.Add(new HitboxFrame
            {
                id = $"{hitbox.groupId}-{hitbox.id}-{hitbox.guid}",
                bone = bone,
                x = worldPoint.Z,
                y = worldPoint.Y,
                radius = Math.Max(0.01f, (float)hitbox.size * modelScale),
                damage = (float)hitbox.damage,
                angle = hitbox.angle,
                element = hitbox.element ?? "normal",
                groupId = hitbox.groupId,
                guid = hitbox.guid
            });
        }

        return transformed;
    }

    private static int ResolveBoneIndex(int requestedBone, IReadOnlyList<JointTemplate> joints)
    {
        if (joints.Count == 0)
        {
            return 0;
        }

        if (requestedBone < 0 || requestedBone >= joints.Count)
        {
            return 0;
        }

        return requestedBone;
    }

    private static List<JointTemplate> BuildJointTemplates(HSD_JOBJ root)
    {
        var templates = new List<JointTemplate>();

        void Traverse(HSD_JOBJ? node, int parentIndex)
        {
            if (node == null)
            {
                return;
            }

            var index = templates.Count;
            templates.Add(new JointTemplate
            {
                ParentIndex = parentIndex,
                ScaleCompensate = node.Flags.HasFlag(JOBJ_FLAG.MTX_SCALE_COMPENSATE),
                DefaultTranslation = new Vector3(node.TX, node.TY, node.TZ),
                DefaultRotation = new Vector3(node.RX, node.RY, node.RZ),
                DefaultScale = new Vector3(node.SX, node.SY, node.SZ)
            });

            if (parentIndex >= 0)
            {
                templates[parentIndex].HasChild = true;
            }

            Traverse(node.Child, index);
            Traverse(node.Next, parentIndex);
        }

        Traverse(root, -1);
        return templates;
    }

    private static string ResolveModelDatPath(string modelDatsDir, string code)
    {
        var preferred = Path.Combine(modelDatsDir, $"Pl{code}Nr.dat");
        if (File.Exists(preferred))
        {
            return preferred;
        }

        var candidates = Directory.Exists(modelDatsDir)
            ? Directory.GetFiles(modelDatsDir, $"Pl{code}*.dat")
                .Where(path =>
                {
                    var file = Path.GetFileName(path);
                    return !string.Equals(file, $"Pl{code}.dat", StringComparison.OrdinalIgnoreCase) &&
                           !string.Equals(file, $"Pl{code}AJ.dat", StringComparison.OrdinalIgnoreCase);
                })
                .OrderBy(path => Path.GetFileName(path), StringComparer.OrdinalIgnoreCase)
                .ToArray()
            : Array.Empty<string>();

        return candidates.FirstOrDefault() ?? string.Empty;
    }

    private static string CharacterFileStem(string characterName)
    {
        return characterName.Replace(" ", "%20", StringComparison.Ordinal);
    }

    private static string NormalizeSymbol(string? value)
    {
        return string.IsNullOrEmpty(value) ? string.Empty : value.Trim().TrimEnd('\0');
    }

    private static float ReadModelScale(SBM_FighterData fighterData)
    {
        var value = fighterData.Attributes.ModelScale;
        if (!float.IsFinite(value) || value <= Epsilon)
        {
            return 1f;
        }

        return value;
    }

    private sealed class PoseComputer
    {
        private readonly JointTemplate[] _joints;
        private readonly List<FOBJ_Player>[] _tracksByBone;
        private readonly int _maxFrame;
        private readonly Dictionary<int, Matrix4[]> _frameCache = new();

        public PoseComputer(HSD_FigaTree tree, IReadOnlyList<JointTemplate> joints)
        {
            _joints = joints.ToArray();
            _maxFrame = Math.Max(0, (int)MathF.Floor(tree.FrameCount) - 1);

            _tracksByBone = new List<FOBJ_Player>[Math.Max(_joints.Length, tree.NodeCount)];
            var nodes = tree.Nodes;
            for (var i = 0; i < nodes.Count; i += 1)
            {
                var tracks = new List<FOBJ_Player>();
                foreach (var track in nodes[i].Tracks)
                {
                    var keys = track.GetKeys();
                    if (keys.Count == 0)
                    {
                        continue;
                    }

                    tracks.Add(new FOBJ_Player(track.TrackType, keys));
                }

                _tracksByBone[i] = tracks;
            }
        }

        public Matrix4[] GetWorldTransforms(int frame)
        {
            frame = Math.Clamp(frame, 0, _maxFrame);

            if (_frameCache.TryGetValue(frame, out var cached))
            {
                return cached;
            }

            var local = new Matrix4[_joints.Length];
            var world = new Matrix4[_joints.Length];

            for (var i = 0; i < _joints.Length; i += 1)
            {
                var joint = _joints[i];
                var translation = joint.DefaultTranslation;
                var rotation = joint.DefaultRotation;
                var scale = joint.DefaultScale;

                if (i < _tracksByBone.Length && _tracksByBone[i] != null)
                {
                    foreach (var track in _tracksByBone[i])
                    {
                        switch (track.JointTrackType)
                        {
                            case JointTrackType.HSD_A_J_ROTX:
                                rotation.X = track.GetValue(frame);
                                break;
                            case JointTrackType.HSD_A_J_ROTY:
                                rotation.Y = track.GetValue(frame);
                                break;
                            case JointTrackType.HSD_A_J_ROTZ:
                                rotation.Z = track.GetValue(frame);
                                break;
                            case JointTrackType.HSD_A_J_TRAX:
                                translation.X = track.GetValue(frame);
                                break;
                            case JointTrackType.HSD_A_J_TRAY:
                                translation.Y = track.GetValue(frame);
                                break;
                            case JointTrackType.HSD_A_J_TRAZ:
                                translation.Z = track.GetValue(frame);
                                break;
                            case JointTrackType.HSD_A_J_SCAX:
                                scale.X = track.GetValue(frame);
                                break;
                            case JointTrackType.HSD_A_J_SCAY:
                                scale.Y = track.GetValue(frame);
                                break;
                            case JointTrackType.HSD_A_J_SCAZ:
                                scale.Z = track.GetValue(frame);
                                break;
                        }
                    }
                }

                var localTransform = BuildLocalTransform(scale, rotation, translation);
                if (joint.ParentIndex >= 0)
                {
                    if (joint.ScaleCompensate)
                    {
                        var parentScale = local[joint.ParentIndex].ExtractScale();
                        var safeParentScale = new Vector3(
                            Math.Abs(parentScale.X) <= Epsilon ? 1f : parentScale.X,
                            Math.Abs(parentScale.Y) <= Epsilon ? 1f : parentScale.Y,
                            Math.Abs(parentScale.Z) <= Epsilon ? 1f : parentScale.Z
                        );

                        var translated = translation * safeParentScale;
                        localTransform = BuildLocalTransform(scale, rotation, translated);

                        var compensation = Matrix4.CreateScale(
                            1f / safeParentScale.X,
                            1f / safeParentScale.Y,
                            1f / safeParentScale.Z
                        );
                        world[i] = localTransform * compensation * world[joint.ParentIndex];
                    }
                    else
                    {
                        world[i] = localTransform * world[joint.ParentIndex];
                    }
                }
                else
                {
                    world[i] = localTransform;
                }

                local[i] = localTransform;
            }

            _frameCache[frame] = world;
            return world;
        }

        private static Matrix4 BuildLocalTransform(Vector3 scale, Vector3 rotation, Vector3 translation)
        {
            return Matrix4.CreateScale(scale) *
                   CreateMatrixFromEuler(rotation.X, rotation.Y, rotation.Z) *
                   Matrix4.CreateTranslation(translation);
        }

        private static Matrix4 CreateMatrixFromEuler(float x, float y, float z)
        {
            var sx = MathF.Sin(x);
            var cx = MathF.Cos(x);
            var sy = MathF.Sin(y);
            var cy = MathF.Cos(y);
            var sz = MathF.Sin(z);
            var cz = MathF.Cos(z);

            var m11 = cy * cz;
            var m12 = cy * sz;
            var m13 = -sy;
            var m21 = cz * sx * sy - cx * sz;
            var m22 = sz * sx * sy + cx * cz;
            var m23 = sx * cy;
            var m31 = cz * cx * sy + sx * sz;
            var m32 = sz * cx * sy - sx * cz;
            var m33 = cx * cy;

            return new Matrix4(
                m11, m12, m13, 0,
                m21, m22, m23, 0,
                m31, m32, m33, 0,
                0, 0, 0, 1
            );
        }
    }

    private sealed class JointTemplate
    {
        public int ParentIndex { get; init; }

        public bool HasChild { get; set; }

        public bool ScaleCompensate { get; init; }

        public Vector3 DefaultTranslation { get; init; }

        public Vector3 DefaultRotation { get; init; }

        public Vector3 DefaultScale { get; init; }
    }

    private sealed record CharacterInfo(string Code, string Name);

    private sealed class Options
    {
        public string CleanDatsDir { get; init; } = "";

        public string ModelDatsDir { get; init; } = "";

        public string FramedataDir { get; init; } = "";

        public string OutDir { get; init; } = "";

        public string? CharacterFilter { get; init; }

        public bool MatchesCharacter(CharacterInfo character)
        {
            if (string.IsNullOrWhiteSpace(CharacterFilter))
            {
                return true;
            }

            var value = CharacterFilter.Trim();
            if (string.Equals(character.Code, value, StringComparison.OrdinalIgnoreCase))
            {
                return true;
            }

            if (string.Equals(character.Name, value, StringComparison.OrdinalIgnoreCase))
            {
                return true;
            }

            return string.Equals(Slug(character.Name), Slug(value), StringComparison.OrdinalIgnoreCase);
        }

        public static Options Parse(string[] args)
        {
            if (args.Length == 0)
            {
                throw new ArgumentException(Usage());
            }

            var values = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
            for (var i = 0; i < args.Length; i += 1)
            {
                var arg = args[i];
                if (arg is "-h" or "--help")
                {
                    throw new ArgumentException(Usage());
                }

                if (!arg.StartsWith("--", StringComparison.Ordinal))
                {
                    throw new ArgumentException($"unknown argument: {arg}\n\n{Usage()}");
                }

                if (i + 1 >= args.Length || args[i + 1].StartsWith("--", StringComparison.Ordinal))
                {
                    throw new ArgumentException($"missing value for {arg}\n\n{Usage()}");
                }

                values[arg] = args[i + 1];
                i += 1;
            }

            if (!values.TryGetValue("--clean-dats", out var cleanDatsDir))
            {
                throw new ArgumentException($"missing required --clean-dats\n\n{Usage()}");
            }

            if (!values.TryGetValue("--model-dats", out var modelDatsDir))
            {
                throw new ArgumentException($"missing required --model-dats\n\n{Usage()}");
            }

            if (!values.TryGetValue("--framedata-dir", out var framedataDir))
            {
                throw new ArgumentException($"missing required --framedata-dir\n\n{Usage()}");
            }

            if (!values.TryGetValue("--out-dir", out var outDir))
            {
                throw new ArgumentException($"missing required --out-dir\n\n{Usage()}");
            }

            return new Options
            {
                CleanDatsDir = Path.GetFullPath(cleanDatsDir),
                ModelDatsDir = Path.GetFullPath(modelDatsDir),
                FramedataDir = Path.GetFullPath(framedataDir),
                OutDir = Path.GetFullPath(outDir),
                CharacterFilter = values.TryGetValue("--character", out var filter) ? filter : null
            };
        }

        private static string Slug(string value)
        {
            var chars = value
                .ToLowerInvariant()
                .Select(character => char.IsLetterOrDigit(character) ? character : '-')
                .ToArray();
            var collapsed = new string(chars);
            while (collapsed.Contains("--", StringComparison.Ordinal))
            {
                collapsed = collapsed.Replace("--", "-", StringComparison.Ordinal);
            }

            return collapsed.Trim('-');
        }

        private static string Usage()
        {
            return
                "Usage: dotnet run --project tools/hurtbox-cache-extractor -- " +
                "--clean-dats <path> --model-dats <path> --framedata-dir <path> --out-dir <path> " +
                "[--character <code-or-name>]";
        }
    }

    private sealed class CharacterCache
    {
        public string character { get; set; } = "";

        public string code { get; set; } = "";

        public float modelScale { get; set; } = 1f;

        public string generatedAt { get; set; } = "";

        public Dictionary<string, MoveCache> moves { get; set; } = new(StringComparer.Ordinal);
    }

    private sealed class MoveCache
    {
        public string? subactionName { get; set; }

        public int frameCount { get; set; }

        public List<FrameCache> frames { get; set; } = new();
    }

    private sealed class FrameCache
    {
        public List<HurtboxFrame> hurtboxes { get; set; } = new();

        public List<HitboxFrame> hitboxes { get; set; } = new();
    }

    private sealed class HurtboxFrame
    {
        public string id { get; set; } = "";

        public string type { get; set; } = "mid";

        public int bone { get; set; }

        public bool grabbable { get; set; }

        public float x { get; set; }

        public float y { get; set; }

        public float x1 { get; set; }

        public float y1 { get; set; }

        public float x2 { get; set; }

        public float y2 { get; set; }

        public float radius { get; set; }
    }

    private sealed class HitboxFrame
    {
        public string id { get; set; } = "";

        public int bone { get; set; }

        public float x { get; set; }

        public float y { get; set; }

        public float radius { get; set; }

        public float damage { get; set; }

        public int angle { get; set; }

        public string element { get; set; } = "normal";

        public int groupId { get; set; }

        public int guid { get; set; }
    }

    private sealed class HitboxLocal
    {
        public int id { get; set; }

        public int bone { get; set; }

        public double damage { get; set; }

        public double size { get; set; }

        public double x { get; set; }

        public double y { get; set; }

        public double z { get; set; }

        public int angle { get; set; }

        public string element { get; set; } = "normal";

        public int groupId { get; set; }

        public int guid { get; set; }
    }

    private sealed class MoveData
    {
        public int subactionIndex { get; set; }

        public string? subactionName { get; set; }

        public float totalFrames { get; set; }

        public int? iasa { get; set; }

        public List<HitFrameWindow>? hitFrames { get; set; }
    }

    private sealed class HitFrameWindow
    {
        public int start { get; set; }

        public int end { get; set; }

        public List<HitboxLocal>? hitboxes { get; set; }
    }

    private sealed class DatDumpRoot
    {
        public List<DatNode>? nodes { get; set; }
    }

    private sealed class DatNode
    {
        public DatNodeData? data { get; set; }
    }

    private sealed class DatNodeData
    {
        public List<DatSubaction>? subactions { get; set; }
    }

    private sealed class DatSubaction
    {
        public List<DatScriptEvent>? events { get; set; }
    }

    private sealed class DatScriptEvent
    {
        public string? name { get; set; }

        public HitboxEventFields? fields { get; set; }
    }

    private sealed class HitboxEventFields
    {
        public int? frame { get; set; }

        public int? frames { get; set; }

        public int? id { get; set; }

        public int? bone { get; set; }

        public double? damage { get; set; }

        public double? size { get; set; }

        public double? x { get; set; }

        public double? y { get; set; }

        public double? z { get; set; }

        public int? angle { get; set; }

        public string? element { get; set; }

        public int? groupId { get; set; }

        public int? guid { get; set; }

        public int? hitboxId { get; set; }
    }
}
