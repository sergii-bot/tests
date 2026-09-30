// Skild AI investors, exactly as named in the official round posts (skild.ai/blogs/announcing-our-300m-series-a, /series-c).
// url: the investor's official site (verified reachable 2026-09-28; omitted where no unambiguous official site was found).
// Logos are hotlinked from skild.ai where the site publishes one; others are set as wordmarks.
const LOGO = n => `https://www.skild.ai/_next/static/media/${n}.svg`;
export const ROUNDS = [
  {id: 'series-a', name: 'Series A', date: '2024-07-09', amount: '$300M', valuation: '$1.5B valuation', url: 'https://www.skild.ai/blogs/announcing-our-300m-series-a'},
  {id: 'series-c', name: 'Series C', date: '2026-01-14', amount: '$1.4B', valuation: '$14B+ valuation', url: 'https://www.skild.ai/blogs/series-c'},
];
// rounds: A = Series A, C = Series C. lead: led that round.
export const INVESTORS = [
  {name: 'SoftBank Group', url: 'https://group.softbank/en', logo: LOGO('Softbank.02cbc0d6'), rounds: ['A', 'C'], lead: ['A', 'C']},
  {name: 'Lightspeed', url: 'https://lsvp.com', logo: LOGO('Lightspeed.7c92d491'), rounds: ['A', 'C'], lead: ['A']},
  {name: 'Coatue', url: 'https://www.coatue.com', logo: LOGO('Coatue.8d1dcf18'), rounds: ['A', 'C'], lead: ['A']},
  {name: 'Bezos Expeditions', url: 'https://www.bezosexpeditions.com', logo: LOGO('Bezos.7c21dacc'), rounds: ['A', 'C'], lead: ['A']},
  {name: 'NVentures (NVIDIA)', url: 'https://www.nventures.ai/', rounds: ['C']},
  {name: 'Macquarie Capital', url: 'https://www.macquarie.com/us/en/about/company/macquarie-capital.html', rounds: ['C']},
  {name: 'Sequoia', url: 'https://sequoiacap.com', logo: LOGO('Sequoia.108b774c'), rounds: ['A', 'C']},
  {name: 'Felicis', url: 'https://www.felicis.com', logo: LOGO('Felicis.969f5a52'), rounds: ['A', 'C']},
  {name: 'Menlo Ventures', url: 'https://menlovc.com', logo: LOGO('menlo.c6b05985'), rounds: ['A']},
  {name: 'General Catalyst', url: 'https://www.generalcatalyst.com', logo: LOGO('GeneralCatalyst.7cee4185'), rounds: ['A']},
  {name: 'CRV', url: 'https://www.crv.com', logo: LOGO('Crv.b9fa2476'), rounds: ['A']},
  {name: 'SV Angel', url: 'https://svangel.com', logo: LOGO('svAngel.64eea502'), rounds: ['A']},
  {name: 'Carnegie Mellon University', url: 'https://www.cmu.edu', logo: LOGO('CarnegieUniversity.ec4737fc'), rounds: ['A']},
  {name: 'Amazon Industrial Innovation Fund & Alexa Fund', url: 'https://developer.amazon.com/en-US/alexa/alexa-fund-venture-capital/', logo: LOGO('Amazon.944145b6'), rounds: ['A']},
  {name: 'LG', url: 'https://www.lg.com', rounds: ['C'], strategic: true},
  {name: 'Schneider Electric', url: 'https://www.se.com', rounds: ['C'], strategic: true},
  {name: 'CommonSpirit', url: 'https://www.commonspirit.org', rounds: ['C'], strategic: true},
  {name: 'Salesforce Ventures', url: 'https://salesforceventures.com', rounds: ['C'], strategic: true},
  {name: 'Disruptive', rounds: ['C']}, {name: '1789 Capital', url: 'https://www.1789capital.io', rounds: ['C']}, {name: 'IQT', url: 'https://www.iqt.org', rounds: ['C']},
  {name: 'TF Capital', rounds: ['C']}, {name: 'Andra Capital', url: 'https://www.andracapital.com', rounds: ['C']}, {name: 'Palo Alto Growth Capital', url: 'https://paloalto.capital', rounds: ['C']},
  {name: 'Alpha Square', rounds: ['C']}, {name: 'Mirae Asset', url: 'https://www.miraeasset.com', rounds: ['C']}, {name: 'Destiny', rounds: ['C']},
];
