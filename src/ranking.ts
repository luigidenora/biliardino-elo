import { MatchService } from './services/match.service';
import { MatchmakingService } from './services/matchmaking.service';
import { PlayerService } from './services/player.service';
import { RepositoryService } from './services/repository.service';
import { updateElo } from './utils/update-elo.util';
import { RankingView } from './views/ranking.view';

MatchService.loadMatches(await RepositoryService.loadMatches());
PlayerService.loadPlayers(await RepositoryService.loadPlayers());

MatchService.getAllMatches().forEach(m => updateElo(m));

RankingView.init();

console.time('Matchmaking Time');
console.log(MatchmakingService.findBestMatches([
  'Andrea Gargaro',
  'Samuele Pesce',
  'Davide Silletti',
  'Alfredo Sette',
  'Francesco Molinari',
  'Loris Bevilacqua',
  'Michele Porcu',
  'Michele Lillo',
  'Salvatore Defino',
  'Dario Spinosa',
  'Matteo Attanasio',
  'Andrea Fraccalvieri',
  'Nicola Sergio',
  'Filippo Addabbo',
  'Luigi Denora',
  'Giuseppe Latrofa',
  'Davide Colucci',
  'Domenico Pace',
  'Andrea Difonzo',
  'Michele Sette',
  'Andrea Greco',
  'Gianluca De Vincenzo',
  'Marco De Luca'
]));
console.timeEnd('Matchmaking Time');
