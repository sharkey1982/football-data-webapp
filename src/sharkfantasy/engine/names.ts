// ============================================================================
// Shark Fantasy engine: name parts for original fictional identities.
// Generic given names and surnames from many regions, combined at random;
// place names are invented compounds. A combination can still match a real
// person: Phase 3 checks generated names against FixtureShark's lists of
// real footballers and clubs, and redraws any match (design §10).
// ============================================================================

export const REGIONS: Record<string, { nat: string; first: readonly string[]; last: readonly string[] }> = {
  england: { nat: 'England', first: ['Alfie', 'Callum', 'Harvey', 'Reece', 'Toby', 'Kieran', 'Ollie', 'Jamie', 'Lewis', 'Rory', 'Brandon', 'Elliot', 'Freddie', 'Zack'],
    last: ['Ashworth', 'Brackley', 'Cotterill', 'Dunmore', 'Featherby', 'Hollins', 'Kettering', 'Marsden', 'Pilbeam', 'Rudge', 'Sedgwick', 'Thwaite', 'Wardle', 'Yeomans'] },
  scotland: { nat: 'Scotland', first: ['Fraser', 'Euan', 'Calum', 'Ross', 'Murray', 'Hamish', 'Struan'],
    last: ['Abernethy', 'Baird', 'Drummond', 'Gilchrist', 'Kinnaird', 'McAlinden', 'Strachan', 'Tulloch'] },
  ireland: { nat: 'Ireland', first: ['Cian', 'Darragh', 'Oisín', 'Ronan', 'Tadhg', 'Fionn'],
    last: ['Brennock', 'Delahunt', 'Farrelly', 'Mulqueen', 'Tierney', 'Hanratty'] },
  spain: { nat: 'Spain', first: ['Iker', 'Unai', 'Rubén', 'Álvaro', 'Gonzalo', 'Íñigo', 'Mateo'],
    last: ['Arrieta', 'Benítez Sola', 'Cuadrado Ruiz', 'Echeverría', 'Lozano Pita', 'Otxoa', 'Valdeolmos'] },
  france: { nat: 'France', first: ['Mathis', 'Loïc', 'Enzo', 'Baptiste', 'Théo', 'Quentin'],
    last: ['Beaulieu', 'Charpentier', 'Delacroix-Mbeki', 'Fontanel', 'Marchetti', 'Rousselot'] },
  portugal: { nat: 'Portugal', first: ['Tiago', 'Rúben', 'Duarte', 'Gonçalo', 'Vasco'],
    last: ['Carvalhal', 'Fontoura', 'Medeiros', 'Quaresmo', 'Sobral'] },
  brazil: { nat: 'Brazil', first: ['Caio', 'Thiaguinho', 'Wesley', 'Renan', 'Davi', 'Igor'],
    last: ['Assunção', 'Barbalho', 'Cordeiro', 'Damasceno', 'Pinheirinho', 'Teixeira Lobo'] },
  nigeria: { nat: 'Nigeria', first: ['Chidi', 'Emeka', 'Tobi', 'Kelechi', 'Femi', 'Ugo'],
    last: ['Adebanjo', 'Chukwuemeka', 'Ibekwe', 'Okonkwo-Hart', 'Oyelaran'] },
  ghana: { nat: 'Ghana', first: ['Kwabena', 'Yaw', 'Kofi', 'Kwame', 'Fiifi'],
    last: ['Agyekum', 'Boateng-Amoah', 'Darkwah', 'Ofosu', 'Sarpong'] },
  germany: { nat: 'Germany', first: ['Jannik', 'Lukas', 'Moritz', 'Florian', 'Niklas'],
    last: ['Brandauer', 'Hellwig', 'Kortmann', 'Rasch', 'Weidenfeld'] },
  netherlands: { nat: 'Netherlands', first: ['Jelle', 'Sem', 'Daan', 'Thijs', 'Bram'],
    last: ['van Ommeren', 'de Wolff', 'Hoogland', 'Kuipers', 'Verbeek'] },
  scandinavia: { nat: 'Norway', first: ['Sindre', 'Eirik', 'Magnus', 'Torstein', 'Aksel'],
    last: ['Aasland', 'Bjerknes', 'Haugseth', 'Lindvik', 'Strømsnes'] },
  japan: { nat: 'Japan', first: ['Haruto', 'Sota', 'Ren', 'Yuki', 'Kaito'],
    last: ['Arakawa', 'Hoshino', 'Kurosawa', 'Morishita', 'Tachibana'] },
  usa: { nat: 'United States', first: ['Tanner', 'Brody', 'Cole', 'Jaden', 'Wyatt'],
    last: ['Albrecht', 'Hollister', 'McCaffery', 'Prewitt', 'Sandoval'] },
};
/** Weighting of regions in generated squads (a mostly English league). */
export const REGION_WEIGHTS: Record<string, number> = {
  england: 30, scotland: 6, ireland: 5, spain: 6, france: 6, portugal: 4, brazil: 5,
  nigeria: 4, ghana: 3, germany: 4, netherlands: 4, scandinavia: 4, japan: 3, usa: 3,
};

export const PLACES = ['Gullmouth', 'Brackenvale', 'Saltreach', 'Oakhollow', 'Fennwick', 'Cragmere', 'Tidemarsh', 'Larkspire',
  'Wexmoor', 'Duncliff', 'Harrowdene', 'Mistlebury', 'Corrowick', 'Elderstow', 'Quarrington', 'Ravensholt'] as const;
export const CLUB_SUFFIX = ['United', 'City', 'Rovers', 'Athletic', 'Town', 'Albion', 'Wanderers', 'Harriers'] as const;

export const MANAGER_FIRST = ['Gordon', 'Vince', 'Rosalind', 'Bertie', 'Clive', 'Dolores', 'Ignatius', 'Marguerite', 'Nigel', 'Sven-Ole', 'Pádraig', 'Ottilie'] as const;
export const MANAGER_LAST = ['Pottinger', 'Halloran', 'Smethurst', 'Quibell', 'Vandersloot', 'Ormerod', 'Crickmore', 'Fairbrass', 'Lumley-Price', 'Tench'] as const;
