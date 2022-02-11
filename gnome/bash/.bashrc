#
# ~/.bashrc
#

# Shell Prompt
PS1="\w ❭ " # Normal
# PS1="\e[0;32m \w ❭ \e[m" # Colored

# Aliases
alias sbt='systemctl start bluetooth'
alias cls='clear'
alias ls='ls --color=auto --group-directories-first'
alias e="exit"

## Use the up and down arrow keys for finding a command in history
## (you can write some initial letters of the command first).
bind '"\e[A":history-search-backward'
bind '"\e[B":history-search-forward'

###############################################

# BEGIN_KITTY_SHELL_INTEGRATION
if test -n "$KITTY_INSTALLATION_DIR" -a -e "$KITTY_INSTALLATION_DIR/shell-integration/bash/kitty.bash"; then source "$KITTY_INSTALLATION_DIR/shell-integration/bash/kitty.bash"; fi
# END_KITTY_SHELL_INTEGRATION
