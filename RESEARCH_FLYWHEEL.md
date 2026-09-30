# Research Flywheel: how the Lab turns visitors into signal (design, v0.1 · 2026-09-28)

The goal: every visitor **watches** a real release, **tries** the idea, and in doing so **helps Skild decide and build what's next**. The Lab is honest about what it is. It does not train Skild's production model. It does produce three kinds of useful signal, and each one closes a loop the visitor can see.

## The loop
```
 watch official video → try the stand → dataset (episodes/frames) → research card → research pool (opt-in)
        ↑                                                                             │
        └──── next release pavilion  ←  "what should robots learn next" board  ←──────┘
```

## Three kinds of signal (built today → next)
| Signal | What it is | Today | Next |
|---|---|---|---|
| **Intent / demand** | "What should robots learn next?" votes, free-text tasks, clarity score per release | Research card after every stand → `/api/feedback` → live Research board in the lab | Cluster free-text tasks into a ranked "task wishlist"; export for product and research |
| **Demonstrations** | Human demos in stands (trajectories in *Show it once*, drawn terrains, body configs that broke the robot) | Recorded with `api.record()` into the visitor's dataset; shared only if the visitor opts in (`/api/contribute`) | **Crowd policy:** the robot in *Show it once* learns from all shared demos (behaviour cloning / k-NN on trajectories) and visibly improves as more people teach it |
| **Understanding** | Where people get stuck, what they retry, completion rates | Episodes: inputs, time, completion | A per-stand "confusion map" showing which release claims need a better explanation or video |

## "Watch → learn" inside the system
- Each stand's corner plays the **real robot** doing the same task (`api.clip`), so every game action sits next to the real behaviour.
- Next: an **in-lab learner** that watches the visitor's demos plus the crowd pool and trains a tiny policy in the browser. It shows its loss curve and how its success rate grows with more data. That's the flywheel from the Series C post, made tangible, at toy scale and labelled as such.
- Longer term: hand-labelled keyframes on official clips (the visitor marks "grasp", "pour", "place" on the video timeline). This produces task-segmentation labels, the kind of human-video annotation the *Learning by watching* post relies on.

## Real world
- On release day, the new pavilion (`?release=<id>&present`) becomes the interactive press kit. The research board shows live what people want next.
- The research pool (JSON lines) is exportable for Skild's teams: task wishlist, clarity per release, demo trajectories.
- Investors see the wall of who backs the lab and what shipped since each round, and walk the results.

## Guardrails
- Personal data is never collected. Sharing is opt-in per episode. Names shown in the lab are chosen by the visitor and live only in the session.
- Everything runs locally until the director decides to host it. Hosting turns the research pool into real data collection, so it needs a consent notice and a retention policy before it goes live.
- Game data is labelled as game data. We never claim it trains the production Skild Brain.
