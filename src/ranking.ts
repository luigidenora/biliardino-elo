import { MatchService } from './services/match.service';
import { PlayerService } from './services/player.service';
import { RepositoryService } from './services/repository.service';
import { updateElo } from './utils/update-elo.util';
import { RankingView } from './views/ranking.view';

MatchService.loadMatches(await RepositoryService.loadMatches());
PlayerService.loadPlayers(await RepositoryService.loadPlayers());

MatchService.getAllMatches().forEach(m => updateElo(m));

RankingView.init();
