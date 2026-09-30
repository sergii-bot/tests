# Fixed verification thresholds

V2 additions: manipulator workspace x/z in [-1,1]; grip/release tolerance 0.18 for cell, 0.11 for earbuds. Recorded trail <=96 points. Policy trial observed >=2200ms; replay observed >=3000ms; adapted gait >=1600ms. Humanoid handover requires engineer within 2.7m of beacon. All invalid placements and feedback leave completed skills unchanged. Graphics target remains 60fps; do not relax threshold to hide a failed measurement.
- Target: 60 fps; red smoke: <45 fps; draw-call budget: 80.
- DPR cap: 1.5 desktop, 1 mobile. No real-time shadows, no multi-pass bloom.
- Worst case: warehouse active fleet + four operators + 100000 simulation points.
- Input acknowledgment <100ms local; position sends <=10Hz, authoritative training actions.
- Every movement delta <=0.9 units; server rate limit >=70ms movement messages; world limits +/-150 x, +/-65 z.
- Training proximity <=5 units; shared XP awarded once per unique completed experiment.
- Start path <=2 actions. Touch controls >=44px; 390x844 no horizontal overflow.
- Reconnect within 5 seconds when server reachable. Fifth visitor spectates. Refresh retains same seat.
- Reference route all six skills + deployment. Contrast route cannot gain skill by rewarding before training.
- Two alternative early objective orders; failed training always retryable; reset restores level 1.
- Deterministic JSON state for identical action sequence.
