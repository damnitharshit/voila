autoload -U compinit
compinit

# Colors
autoload -U colors && colors

# History
HISTFILE=~/.histfile
HISTSIZE=1000
SAVEHIST=1000

# Prompt
PS1="% %F{3}▇%f %~ ❭ %"

# Aliases
alias cls='clear'
alias ls='ls --color=auto --group-directories-first'
alias e="exit"


source /usr/share/zsh/plugins/zsh-syntax-highlighting/zsh-syntax-highlighting.zsh
source /usr/share/zsh/plugins/zsh-autosuggestions/zsh-autosuggestions.zsh
