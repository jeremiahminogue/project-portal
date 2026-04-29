import type { Submittal, RFI } from './types';

export const submittals: Submittal[] = [
  {
    id: 'mock-submittal-001',
    number: 'S-001',
    title: 'Fire Alarm Control Panel - Simplex 4100ES',
    specSection: '28 31 11',
    submittedDate: '2026-04-09',
    dueDate: '2026-04-23',
    owner: 'Pueblo Electric',
    status: 'Approved',
    routing: ['PE -> BCER'],
    attachments: [
      {
        name: '4100ES-panel-shop-drawings.pdf',
        size: '3.8 MB',
        type: 'pdf',
        path: 'Submittal S-001 Attachments/4100ES-panel-shop-drawings.pdf'
      },
      {
        name: 'battery-calculation.pdf',
        size: '842 KB',
        type: 'pdf',
        path: 'Submittal S-001 Attachments/battery-calculation.pdf'
      }
    ]
  },
  {
    id: 'mock-submittal-002',
    number: 'S-002',
    title: 'Notification Appliances - Horn/Strobes, Speakers',
    specSection: '28 31 13',
    submittedDate: '2026-04-14',
    dueDate: '2026-04-28',
    owner: 'Pueblo Electric',
    status: 'In Review',
    routing: ['PE -> BCER -> Wember'],
    attachments: [
      {
        name: 'horn-strobe-cut-sheets.pdf',
        size: '2.1 MB',
        type: 'pdf',
        path: 'Submittal S-002 Attachments/horn-strobe-cut-sheets.pdf'
      }
    ]
  },
  {
    id: 'mock-submittal-003',
    number: 'S-003',
    title: 'Smoke Detectors - Photoelectric (TrueAlarm)',
    specSection: '28 31 23',
    submittedDate: '2026-04-14',
    dueDate: '2026-04-28',
    owner: 'Pueblo Electric',
    status: 'Approved',
    routing: ['PE -> BCER']
  },
  {
    id: 'mock-submittal-004',
    number: 'S-004',
    title: 'Duct Smoke Detectors w/ Relay Accessories',
    specSection: '28 31 23',
    submittedDate: '2026-04-16',
    dueDate: '2026-04-30',
    owner: 'Pueblo Electric',
    status: 'Revise & Resubmit',
    routing: ['PE -> BCER']
  },
  {
    id: 'mock-submittal-005',
    number: 'S-005',
    title: 'Power Supplies & Battery Calcs',
    specSection: '28 31 11',
    submittedDate: '2026-04-18',
    dueDate: '2026-05-02',
    owner: 'Pueblo Electric',
    status: 'In Review',
    routing: ['PE -> BCER']
  },
  {
    id: 'mock-submittal-006',
    number: 'S-006',
    title: 'ERRCS Antenna & BDA Specs',
    specSection: '28 31 63',
    submittedDate: '',
    dueDate: '2026-05-08',
    owner: 'JCI',
    status: 'Draft',
    routing: ['JCI -> PE -> BCER']
  }
];

export const rfis: RFI[] = [
  {
    id: 'mock-rfi-001',
    number: 'RFI-001',
    title: 'Existing conduit pathway reuse',
    question: 'Confirm existing conduit pathways at Events Ctr - reusable?',
    suggestedSolution: 'Reuse verified pathways where fill capacity allows; provide new conduit where pathways are blocked or exceed code fill.',
    reference: 'Events Center fire alarm drawings',
    openedDate: '2026-04-10',
    dueDate: '2026-04-24',
    assignedTo: 'Todd Brand',
    assignedOrg: 'BCER',
    status: 'Open',
    attachments: [
      {
        name: 'events-center-conduit-photo.jpg',
        size: '1.4 MB',
        type: 'image',
        path: 'RFI RFI-001 Attachments/events-center-conduit-photo.jpg'
      }
    ]
  },
  {
    id: 'mock-rfi-002',
    number: 'RFI-002',
    title: 'Palace of Ag ceiling scope',
    question: 'Palace of Ag - dropped ceiling vs exposed structure scope?',
    suggestedSolution: 'Proceed with exposed-structure device locations unless the design team confirms dropped ceiling areas by room.',
    reference: 'Palace of Ag scope narrative',
    openedDate: '2026-04-11',
    dueDate: '2026-04-25',
    assignedTo: 'Madison Hoxsie',
    assignedOrg: 'BCER',
    status: 'Open',
    attachments: [
      {
        name: 'palace-of-ag-ceiling-sketch.pdf',
        size: '610 KB',
        type: 'pdf',
        path: 'RFI RFI-002 Attachments/palace-of-ag-ceiling-sketch.pdf'
      }
    ]
  },
  {
    id: 'mock-rfi-003',
    number: 'RFI-003',
    title: 'ERRCS scope boundary',
    question: 'ERRCS coverage requirements - buildings scope boundary?',
    suggestedSolution: 'Carry coverage only for buildings listed in the fire alarm scope unless AHJ adds an explicit requirement.',
    reference: 'Pueblo FD ERRCS direction',
    openedDate: '2026-04-17',
    dueDate: '2026-05-01',
    assignedTo: 'Paul Haley',
    assignedOrg: 'Pueblo FD',
    status: 'Answered'
  },
  {
    id: 'mock-rfi-004',
    number: 'RFI-004',
    title: 'Yellow card sign-off',
    question: 'Yellow card sign-off responsibility & scheduling',
    suggestedSolution: 'Wember to coordinate sign-off window after BCER comments are cleared and before final AHJ inspection.',
    reference: 'Inspection coordination',
    openedDate: '2026-04-18',
    dueDate: '2026-04-25',
    assignedTo: 'Nick Palaski',
    assignedOrg: 'Wember',
    status: 'Open'
  },
  {
    id: 'mock-rfi-005',
    number: 'RFI-005',
    title: 'Sprinkler tie-in responsibility',
    question: 'Sprinkler scope interface - who handles tie-in?',
    suggestedSolution: 'Assign sprinkler tie-in to the sprinkler contractor; Pueblo Electric to coordinate monitoring connections only.',
    reference: 'Scope split / Division 28',
    openedDate: '2026-04-20',
    dueDate: '2026-05-04',
    assignedTo: 'Taylor Boggio',
    assignedOrg: 'JCI',
    status: 'Open'
  }
];
