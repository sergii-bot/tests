// SKILD RELEASE HALL — release registry.
// One entry per Skild AI release/blog post, oldest first. The hall builds one pavilion per entry:
// an in-world screen with the official video, a plaque, and a TRY stand that mounts ./try/<try.module>.js.
// To add a new release: append an entry here and (optionally) add a try module. Nothing else changes.
//
// Copy is written for the game (summaries in our own words). Every pavilion links to the original post.
// Videos stream from Skild's official hosts (assets.skild.ai / skild.ai / YouTube) — nothing is re-hosted.

const S1 = 'https://assets.skild.ai/site/v1/blog/sb-812a99baf442e4fb5939/';
const SP = 'https://assets.skild.ai/site/v1/blog/ps-6951ca2f9fab4531409a/';
const RM = 'https://assets.skild.ai/site/v1/blog/rm-89f4efa0b11bdfa26926/';
const mp4 = (base, name, title) => ({type: 'mp4', src: base + name + '.mp4', poster: base + name + '-poster.jpg', title});
const yt = (id, title) => ({type: 'youtube', id, title, poster: `https://i.ytimg.com/vi/${id}/hqdefault.jpg`});
const site = (src, title) => ({type: 'mp4', src, poster: null, title});

export const RELEASES = [
  {
    id: 'series-a', date: '2024-07-09', kind: 'company', code: 'SKD-00',
    title: 'Out of stealth', subtitle: '$300M Series A',
    url: 'https://www.skild.ai/blogs/announcing-our-300m-series-a',
    summary: 'Skild AI comes out of stealth to build one general-purpose brain for robots. The core bet: break the robotics data barrier with scale, instead of building one robot for one job.',
    points: ['Founded in 2023 by Deepak Pathak and Abhinav Gupta', 'One model across manipulation, locomotion and navigation', '$300M Series A at a $1.5B valuation'],
    videos: [site('https://www.skild.ai/video/banner.mp4', 'Skild AI')],
    try: {module: 'series-a', title: 'Break the data barrier', verb: 'Feed the brain', blurb: 'Bespoke robots each need their own program. Pour data into one shared brain and watch every body improve at once.'},
  },
  {
    id: 'skild-brain', date: '2025-07-29', kind: 'model', code: 'SKD-01',
    title: 'The Skild Brain', subtitle: 'Building the general-purpose robotic brain',
    url: 'https://www.skild.ai/blogs/building-the-general-purpose-robotic-brain',
    summary: 'The Skild Brain is hierarchical: a low-frequency high-level policy issues manipulation and navigation commands, and a high-frequency low-level policy turns them into precise joint angles and motor torques. One omni-bodied brain for quadrupeds, humanoids, tabletop arms and mobile manipulators.',
    points: ['Any task, any robot, one brain', 'Low-frequency high-level policy → high-frequency low-level control', 'Trained on simulation and human video, not a VLM with <1% robot data'],
    videos: [yt('lC1M_Zaje9o', 'Building the general-purpose robotic brain')],
    try: {module: 'skild-brain', title: 'Two brains in one', verb: 'Command the robot', blurb: 'Stylized stand-in: you play the low-frequency high-level policy by clicking a goal. A stand-in low-level controller turns it into joint motion on the body you pick.'},
  },
  {
    id: 'one-policy', date: '2025-08-06', kind: 'model', code: 'SKD-02',
    title: 'One model, any scenario', subtitle: 'End-to-end locomotion from vision',
    url: 'https://www.skild.ai/blogs/one-policy-all-scenarios',
    summary: 'From raw camera images and joint feedback, one network walks a humanoid over flat ground, stairs and obstacles it has never seen, with no map, no planning and no switching between behaviors. Tested in parks, city streets and fire escapes.',
    points: ['Vision + proprioception → low-level motor commands', 'No stair mode, no step-over mode: one policy for everything', 'Precise footwork on stairs just 3 cm deeper than the foot', 'Recovers when pushed or pulled; carries payloads on stairs'],
    videos: [yt('GTImKXRBB6A', 'One Model, Any Scenario: End-to-end Locomotion from Vision'), yt('_3jkxcfi1CM', 'Humanoid taking a stroll in a park full of stairs'), yt('9Voj_uqbzTk', 'Unstructured obstacles'), yt('gragm39KAGI', 'Fire Escape Ascend'), yt('BWEied-nbsk', 'Carrying payloads up / down stairs'), yt('Yf3vQRGUWo4', 'Push / Pull')],
    try: {module: 'one-policy', title: 'Draw the terrain', verb: 'Build a course', blurb: 'Sketch stairs, pallets and gaps. The robot sees them only as it walks and reacts step by step (stylized simulation).'},
  },
  {
    id: 'parkour', date: '2025-08-07', dateLabel: 'Skild AI showcase', kind: 'showcase', code: 'SKD-02+',
    title: 'Parkour', subtitle: 'Agile locomotion from vision',
    url: 'https://www.skild.ai/',
    summary: 'Skild AI’s parkour compilation shows a humanoid jumping onto and between stacked boxes and climbing fire-escape stairs. The research root is Extreme Parkour (CMU, ICRA 2024): one neural network from a depth camera to joint commands on a low-cost robot dog.',
    points: ['Compilation video: a humanoid on boxes and fire-escape stairs', 'Research root, not a Skild release: Extreme Parkour (CMU, ICRA 2024)', 'Paper: high jumps 2× its height, long jumps 2× its length'],
    videos: [site('https://dtkk46np7h1p6.cloudfront.net/videos/Parkour-Compilation.mp4', 'Skild AI · Parkour compilation'), {type: 'mp4', src: 'https://www.cs.cmu.edu/~dpathak/images/parkour.mp4', poster: null, title: 'Extreme Parkour (CMU, ICRA 2024)'}, yt('gragm39KAGI', 'Fire Escape Ascend')],
    try: {module: 'extreme-parkour', title: 'Extreme Parkour', verb: 'Run the course', blurb: 'Pick a body: a humanoid like Skild’s compilation (boxes, stairs) or the CMU robot dog from Extreme Parkour (high jump, long jump, ramp, handstand). A stand-in controller runs your course from depth.'},
  },
  {
    id: 'omni-bodied', date: '2025-09-24', kind: 'model', code: 'SKD-03',
    title: 'Omni-bodied', subtitle: 'The case for an omni-bodied robot brain',
    url: 'https://www.skild.ai/blogs/omni-bodied',
    summary: 'Train one brain on 100,000 different simulated robots, so it can’t memorize any single body. The result keeps walking through broken limbs, jammed motors, stilts and bodies it has never seen.',
    points: ['100,000 simulated robot bodies, one brain', 'Test robots excluded from training: zero-shot', 'Adapts in context: lost limbs, locked knees, jammed wheels, stilts', 'Fails, then succeeds on trial 3 with past trials as context'],
    videos: [yt('p43pFxCFSzY', 'Adapting to loss of limbs'), yt('Z2chIArzLDk', 'Adapting to failed leg motors'), yt('JQAfxp-FB0I', 'Chainsaw vs. Robot'), yt('gbQXrY4YRD0', 'Learning from failures: cross-trial adaptation'), yt('unV-jxi-qjI', 'Adapting to locked wheels and added payload'), yt('BEqxERQXbMM', 'Adapting to stilts')],
    try: {module: 'omni-bodied', title: 'Break the robot', verb: 'Sabotage it', blurb: 'Snap a leg, jam a motor, stretch the body. The same brain finds a new way to move without retraining.'},
  },
  {
    id: 'learning-by-watching', date: '2026-01-12', kind: 'model', code: 'SKD-04',
    title: 'Learning by watching', subtitle: 'Learning from human videos',
    url: 'https://www.skild.ai/blogs/learning-by-watching',
    summary: 'Teleoperation can’t reach internet scale. Human video can. Skild bridges the embodiment gap, so a robot learns a new skill from watching people, with less than an hour of robot data.',
    points: ['LLMs had internet-scale data; robotics doesn’t. Human video is abundant', 'Bridges the embodiment gap between human hands and robot bodies', 'New skills from watching videos plus < 1 hr of robot data'],
    videos: [yt('YRmjBdKKLsc', 'Learning by watching human videos')],
    try: {module: 'learning-by-watching', title: 'Show it once', verb: 'Be the teacher', blurb: 'Draw a motion with your hand (the mouse). The robot arm maps it to its own joints and repeats it.'},
  },
  {
    id: 'series-c', date: '2026-01-14', kind: 'company', code: 'SKD-05',
    title: 'The data flywheel', subtitle: '$1.4B Series C',
    url: 'https://www.skild.ai/blogs/series-c',
    summary: 'SoftBank leads a $1.4B round at a $14B+ valuation. The engine behind it is a data flywheel: simulation, internet video, teleoperation and real deployments, where every robot in the field makes the whole fleet smarter.',
    points: ['The Skild Brain: one foundation model for quadrupeds, humanoids, arms and mobile manipulators', 'Data flywheel: simulation, internet videos, teleoperation, real deployments', '$1.4B led by SoftBank, with NVentures (NVIDIA), Macquarie Capital and Bezos Expeditions'],
    videos: [yt('6jSM3-2yt2s', 'Announcing Series C: A look at the past results')],
    try: {module: 'series-c', title: 'Spin the flywheel', verb: 'Deploy robots', blurb: 'Route data from four sources into the brain, deploy robots, and watch deployments feed data back in.'},
  },
  {
    id: 'bengaluru', date: '2026-02-19', kind: 'company', code: 'SKD-06',
    title: 'Bengaluru', subtitle: 'Expanding the global footprint',
    url: 'https://www.skild.ai/blogs/bengaluru',
    summary: 'Skild opens its first office outside the US, in Bengaluru, joining its teams in Pennsylvania and California. It is a move from one Silicon Valley to another.',
    points: ['First expansion beyond the US', 'California · Pennsylvania · Bengaluru', 'Building one brain for any robot takes dense technical talent'],
    videos: [site('https://dtkk46np7h1p6.cloudfront.net/videos/human_video_lt.mp4', 'Skild AI')],
    try: {module: 'bengaluru', title: 'Around the clock', verb: 'Follow the sun', blurb: 'An illustrative game: three teams in California, Pennsylvania and Bengaluru hand one training run across time zones.'},
  },
  {
    id: 'reindustrial', date: '2026-03-19', kind: 'partnership', code: 'SKD-07',
    title: 'The Reindustrial Revolution', subtitle: 'ABB Robotics · Universal Robots · NVIDIA',
    url: 'https://www.skild.ai/blogs/reindustrial-revolution',
    summary: 'Skild is partnering with ABB Robotics, Universal Robots and MiR to bring one omni-bodied Skild Brain to OEM robots, without task-by-task reprogramming. The plan is phased: factories first, then less structured places like hospitals and hotels, then homes. At NVIDIA GTC, dual arms assembled a Blackwell server tray live.',
    points: ['Partners: ABB Robotics, Universal Robots, MiR', 'No task-by-task reprogramming', 'Live at GTC: assembling an NVIDIA Blackwell GPU'],
    videos: [yt('ZSXQW6PLJrM', 'Live from GTC: The Skild Brain Assembles an NVIDIA Blackwell GPU'), yt('su8GxzTuviA', 'Robots doing Precision Task with Extreme Robustness!')],
    try: {module: 'reindustrial', title: 'Swap the arm', verb: 'Change hardware', blurb: 'Pick an industrial arm, a cobot or a mobile base. Hit run: the same brain does the same job on each.'},
  },
  {
    id: 'zebra', date: '2026-04-15', kind: 'company', code: 'SKD-08',
    title: 'Into the warehouse', subtitle: 'Acquiring Zebra Robotics (Fetch)',
    url: 'https://www.skild.ai/blogs/skild-zebra',
    summary: 'Skild acquires Zebra’s robotics division, formerly Fetch Robotics, to bring the omni-bodied brain to end-to-end warehouse fulfillment, including the steps that were still human-bottlenecked.',
    points: ['Robotics division previously known as Fetch Robotics', 'End-to-end fulfillment, not just navigation', 'More deployments → more data'],
    videos: [yt('dTOdwnBmcC0', 'Skild AI Acquires Zebra Technologies’ Robotics Arm')],
    try: {module: 'zebra', title: 'Run the warehouse', verb: 'Fulfill orders', blurb: 'Orders stream in. Dispatch the fleet: mobile robots route, the brain picks and packs. Beat the clock.'},
  },
  {
    id: 's1', date: '2026-08-18', kind: 'model', code: 'SKD-09',
    title: 'S1', subtitle: 'In-context learning for robotics',
    url: 'https://www.skild.ai/blogs/s1',
    summary: 'S1 learns in context: show it one video of a task, seen or unseen and up to about 10 minutes long, and it performs it with the same frozen weights, with no fine-tuning or post-training. Named unseen tasks: pancakes, coffee, potting and kit assembly.',
    points: ['One video prompt → the robot executes', 'Unseen, long-horizon tasks (~10 min)', 'Emergent recovery and common sense'],
    videos: [
      mp4(S1, 'cover-v2', 'S1'),
      mp4(S1, 'lab-cup', 'Seen: lab cup'), mp4(S1, 'flakes-macro', 'Seen: flakes (macro)'), mp4(S1, 'bandaid-elbow', 'Seen: bandage on elbow'), mp4(S1, 'pack-lift', 'Seen: lift a pack'), mp4(S1, 'cable-loop', 'Seen: cable loop'), mp4(S1, 'ribbon-retie', 'Seen: re-tie a ribbon'), mp4(S1, 'syringe-hold', 'Seen: hold a syringe'),
      mp4(S1, 'pancakes-prompt', 'Prompt: pancakes'), mp4(S1, 'pancakes', 'S1: pancakes'), mp4(S1, 'coffee-prompt', 'Prompt: coffee'), mp4(S1, 'coffee', 'S1: coffee'), mp4(S1, 'kitting-prompt', 'Prompt: kitting'), mp4(S1, 'kitting', 'S1: kitting'), mp4(S1, 'potting-prompt', 'Prompt: potting'), mp4(S1, 'potting', 'S1: potting'),
      mp4(S1, 'pancake-recovery', 'Robustness: pancakes under perturbation'), mp4(S1, 'coffee-light', 'Robustness: coffee, lighting change'), mp4(S1, 'blue-juice', 'Robustness: blue juice'),
      mp4(S1, 'skate', 'Recovery: skateboard wheel'),
      mp4(S1, 'pouring-affordance', 'Common sense: cup instead of watering can'), mp4(S1, 'orange-juice', 'Common sense: top off the juice'),
      mp4(S1, 'eggs', 'Demo correction: dropped egg'), mp4(S1, 'tennis-ball', 'Demo correction: tennis ball'),
      mp4(S1, 'first-attempt', 'More from the post: first attempt'), mp4(S1, 'slack', 'More from the post: slack'),
    ],
    try: {pip: 9, module: 's1', title: 'Prompt the robot', verb: 'Give it one video', blurb: 'Pick a human demonstration as the prompt. S1 reads it and executes. Then push it off course and watch it recover.'},
  },
  {
    id: '100m-arr', date: '2026-09-10', kind: 'company', code: 'SKD-10',
    title: 'The hidden pillar', subtitle: '$100M ARR in ten months',
    url: 'https://www.skild.ai/blogs/skild-crosses-100m-arr',
    summary: 'Deployment is part of the technology, not the finish line. Skild reached $100M ARR ten months after its first deployment, with 60+ customers across factories, warehouses, kitchens, security and data centers.',
    points: ['60+ paying customers in 10 months', 'NVIDIA × Foxconn: Blackwell assembly', 'Sumitomo wire harnesses · Mitsui commercial kitchens'],
    videos: [mp4(RM, 'cover', 'The hidden pillar')],
    try: {module: '100m-arr', title: 'Deploy the fleet', verb: 'Go to market', blurb: 'Place robots into real industries. Each deployment earns revenue and data, and the data makes the next one easier.'},
  },
  {
    id: 'self-play', date: '2026-09-23', kind: 'model', code: 'SKD-11',
    title: 'Physical self-play', subtitle: 'Beyond human capability',
    url: 'https://www.skild.ai/blogs/physical-self-play',
    summary: 'S1 is pre-trained on human data, so it tops out at human level. Self-play breaks that ceiling: given just one objective, “score”, the policy plays soccer against recent versions of itself and invents skills nobody showed it.',
    points: ['One objective: score, against recent versions of itself', '140 simulated years in NVIDIA Isaac Sim', 'Dribbling, shielding and tackling emerged, not hand-rewarded', 'Policy transferred to a real humanoid'],
    videos: [mp4(SP, 'soccer-green', 'Self-play soccer'), mp4(SP, 'soccer-sim', 'In simulation'), mp4(SP, 'soccer-gray', 'Real world')],
    try: {pip: 2, module: 'self-play', title: 'Train by self-play', verb: 'Play a match', blurb: 'Run generations of self-play, then take the ball against the version you trained. The more it plays itself, the better it gets.'},
  },
];

export const BRAND = {
  orange: '#FF7E00', orange2: '#F97316', orangeSoft: '#FB923C',
  black: '#121212', ink: '#1A1A1A', white: '#FFFFFF',
  warm1: '#F7F5F1', warm2: '#E6E4DD', warm3: '#C1BCB3', warm4: '#8E8177',
  cool1: '#B5B9BA', cool2: '#5C6670', cool3: '#2E3A47', cool4: '#1B222B',
};
