// ------------------------------------------------------------
// EDIT THIS FILE to add / change projects.
// - Order here is the order of the cards and the map waypoints (WP-01, WP-02, ...).
// - category: "industry" | "startup" | "personal"
// - short: label shown next to the project's waypoint on the map
// ------------------------------------------------------------
const PROJECTS = [
  {
    id: "level-ai",
    category: "startup",
    short: "Level AI",
    kicker: "Level AI · Co-founder & technical lead",
    title: "Egocentric data for construction robot learning",
    summary: "Wearable capture rigs and a data pipeline for teaching construction robots by imitation.",
    body: "I co-founded Level AI, a physical AI startup, and led its hardware and data work. We recorded first-person video and motion from skilled workers across six construction trades to train imitation-learning policies. We focused on site-access tasks like layout marking, progress scanning and inspection walks, which are well bounded, low risk and give a clear success or failure signal.",
    points: [
      "Designed a jacket-mounted capture rig: Jetson Orin compute, ZED X stereo plus global-shutter cameras over GMSL2, battery monitoring over I2C",
      "Debugged multi-camera encoding at 1080p60: H.265 frames corrupted under NVENC/GMSL2 bandwidth limits",
      "Automated upload from the edge to tiered cloud storage, with GPU processing of stereo recordings",
      "Evaluated hand-pose retargeting for cross-embodiment learning; off-the-shelf hand tracking struggled on gloved hands, so I proposed a depth-fused pipeline"
    ],
    tags: ["Imitation learning", "Jetson", "Stereo vision", "Data pipelines"],
    links: []
  },
  {
    id: "autonomy",
    category: "industry",
    short: "AV program",
    kicker: "Honda R&D Americas",
    title: "Autonomous vehicle program",
    summary: "Simulation, perception and navigation for off-road autonomous vehicles.",
    body: "I work across the autonomy stack for off-road autonomous vehicles, from simulation to perception to navigation. I'm the design lead on an autonomous vehicle for its proof-of-concept (PoC) programs.",
    points: [
      "Simulation for developing and testing autonomy software",
      "Perception and obstacle detection in unstructured off-road terrain",
      "Navigation and path planning",
      "Cloud backend and DevOps: building services and integrating them into scalable solutions"
    ],
    tags: ["Autonomy", "Simulation", "Perception", "Navigation", "Cloud backend"],
    links: []
  },
  {
    id: "robot-arm",
    category: "personal",
    short: "Arm testbed",
    kicker: "Personal · Robot learning lab",
    title: "Imitation-learning robot arm testbed",
    summary: "A personal robot arm I use to train and test imitation-learning policies.",
    body: "I run my own robot arm platform at home to validate imitation-learning policies outside of work. It's where I try out vision-language-action models and data formats before they matter anywhere else.",
    points: [
      "Evaluating open vision-language-action models (Physical Intelligence openpi: π₀-FAST, π₀.5)",
      "Working with LeRobot-format demonstration datasets",
      "Backed by my own small machine shop and 3D printing for robot hardware"
    ],
    tags: ["Imitation learning", "VLA models", "LeRobot", "Manipulation"],
    links: []
  },
  {
    id: "botbuilt",
    category: "industry",
    short: "BotBuilt",
    kicker: "BotBuilt · Founding engineer",
    title: "Automated prefab wall panels & patents",
    summary: "Built the whole system for robotically manufacturing prefabricated wall panels. Two US patents.",
    body: "I joined BotBuilt as a founding engineer while I was still a student at Duke, then stayed on full-time after graduating. I built the company's entire system for automated prefabricated wall panels, and I'm an inventor on two US patents.",
    points: [
      "US-12233559-B2",
      "US-20240375288-A1"
    ],
    tags: ["Robotics", "Construction", "Patents"],
    links: [
      { label: "US-12233559-B2", url: "https://patents.google.com/patent/US12233559B2" },
      { label: "US-20240375288-A1", url: "https://patents.google.com/patent/US20240375288A1" }
    ]
  },
  {
    id: "smart-archaeology",
    category: "personal",
    short: "SLAM mapping",
    kicker: "Duke University · Smart Archaeology",
    title: "Autonomous 3D site mapping",
    summary: "ROS and computer vision for mapping a dig site in 3D.",
    body: "The Smart Archaeology project at Duke used ROS and computer vision to map sites in 3D autonomously.",
    points: ["Visual SLAM with ORB-SLAM2", "ROS-based sensor integration"],
    tags: ["ROS", "ORB-SLAM2", "SLAM", "Computer vision"],
    links: []
  },
  {
    id: "gpu-lab",
    category: "personal",
    short: "GPU + AI lab",
    kicker: "Personal · Home lab",
    title: "Self-hosted GPU & AI tooling",
    summary: "A home server running GPU services and an LLM pipeline, with one secure way in from anywhere.",
    body: "A rack-mounted server at home runs my storage, automation and GPU experiments. Its main workload are experimential AI services I build such as a self-hosted pipeline that pulls tech, AI and robotics news every morning, has an LLM pick and write up the stories that matter, and emails me the digest. The next phase turns it into a two-host podcast with text-to-speech on the GPU.",
    points: [
      "TrueNAS SCALE with containerized services and an NVIDIA GPU",
      "n8n workflow: RSS ingest, dedupe (~1,400 items down to ~50), LLM ranking and writing, validation, email",
      "GPU text-to-speech service; debugged a CUDA compatibility issue that silently forced it onto the CPU",
      "Reverse proxy with wildcard TLS, private DNS and a mesh VPN subnet router; nothing exposed to the internet"
    ],
    tags: ["CUDA", "Docker", "LLMs", "Networking"],
    links: []
  }
];
