import { Job } from '../models/job.model';

export const SAMPLE_JOBS: Job[] = [
  {
    id: 1,
    title: 'Frontend Developer',
    company: 'TechNova Solutions',
    location: 'Bangalore',
    salary: '₹6–9 LPA',
    type: 'Full Time',
    category: 'Development',
    logoText: 'TN',
    logoBg: '#EEF3FF',
    logoColor: '#345CF0',
    featured: true,
    skills: ['Angular', 'TypeScript', 'HTML/SCSS', 'REST APIs'],
    postedDate: '2 days ago',
    description: 'TechNova Solutions is looking for a talented Frontend Developer proficient in modern Angular, TypeScript, and responsive UI design.'
  },
  {
    id: 2,
    title: 'UI/UX Designer',
    company: 'PixelCraft Studio',
    location: 'Pune',
    salary: '₹4–7 LPA',
    type: 'Full Time',
    category: 'Design',
    logoText: 'PC',
    logoBg: '#F3EEFF',
    logoColor: '#7C3AED',
    featured: true,
    skills: ['Figma', 'UI/UX Design', 'Design Systems', 'Wireframing'],
    postedDate: '1 day ago',
    description: 'Join PixelCraft Studio to create delightful, human-centered SaaS user interfaces and design systems for enterprise software.'
  },
  {
    id: 3,
    title: 'Data Analyst',
    company: 'Insight Analytics',
    location: 'Mumbai',
    salary: '₹5–8 LPA',
    type: 'Full Time',
    category: 'Data Science',
    logoText: 'IA',
    logoBg: '#E8F7F0',
    logoColor: '#16A36A',
    featured: false,
    skills: ['Python', 'SQL', 'Tableau', 'Data Modeling'],
    postedDate: '3 days ago',
    description: 'Insight Analytics is seeking an analytical thinker to transform complex business data into actionable dashboards and strategic insights.'
  },
  {
    id: 4,
    title: 'Digital Marketing Executive',
    company: 'GrowthLabs',
    location: 'Remote',
    salary: '₹3–5 LPA',
    type: 'Remote',
    category: 'Marketing',
    logoText: 'GL',
    logoBg: '#FFF4E6',
    logoColor: '#D97706',
    featured: false,
    skills: ['SEO', 'Google Ads', 'Content Strategy', 'Social Media'],
    postedDate: '4 days ago',
    description: 'Drive high-conversion customer acquisition campaigns, manage paid search and social channels, and optimize organic inbound funnels.'
  },
  {
    id: 5,
    title: 'Java Developer',
    company: 'CodeBridge Technologies',
    location: 'Hyderabad',
    salary: '₹5–8 LPA',
    type: 'Full Time',
    category: 'Development',
    logoText: 'CB',
    logoBg: '#EEF3FF',
    logoColor: '#345CF0',
    featured: true,
    skills: ['Java', 'Spring Boot', 'Microservices', 'PostgreSQL'],
    postedDate: '5 days ago',
    description: 'Architect and scale robust backend services, RESTful microservices, and high-throughput data processing systems using Java & Spring.'
  },
  {
    id: 6,
    title: 'Business Analyst',
    company: 'Nexus Consulting',
    location: 'Delhi',
    salary: '₹4–6 LPA',
    type: 'Hybrid',
    category: 'Business',
    logoText: 'NC',
    logoBg: '#F1F4F9',
    logoColor: '#172C55',
    featured: false,
    skills: ['Agile', 'Requirements Analysis', 'Process Mapping', 'Jira'],
    postedDate: 'Just now',
    description: 'Bridge the gap between client business objectives and technical implementation by defining workflows, specifications, and project scope.'
  }
];

export const CATEGORIES = [
  'All',
  'Development',
  'Design',
  'Marketing',
  'Data Science',
  'Business'
] as const;

