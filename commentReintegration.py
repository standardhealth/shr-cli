import os
import sys
import re
import difflib

def is_unfinished_str(term):
    return term.count('"') % 2 == 1

def remove_empty_str(lis):
    new_list = []
    for i in lis:
        if len(i) > 0:
            new_list.append(i)
    return new_list

def term_present(sentence):
    if 'Grammar' in sentence or 'Entry:' in sentence or 'Element:' in sentence or 'Abstract:' in sentence or 'Group' in sentence:
        return True
    return False

def files(path):
    for file in os.listdir(path):
        if os.path.isfile(os.path.join(path, file)):
            yield file

def keyTerms(sentence):
    sentence = sentence.replace('Coding', 'concept')
    sentence = sentence.replace('CodeableConcept', 'concept')
    sentence = sentence.replace('EntryElement:', 'Entry:')
    sentence = sentence.replace('Abstract Element:', 'Abstract:')
    sentence = sentence.replace('Based on:', 'Parent:')
    sentence = sentence.replace('value is type', 'only')
    sentence = sentence.replace('is type', 'substitute')
    sentence = sentence.replace('DataElement 5.0', 'DataElement 6.0')

    while(sentence.find('ref(') != -1):
        m = sentence.find('ref(')
        index = m + 4
        term = ''
        while sentence[index] != ")":
            term += sentence[index]
            index += 1
        sentence = sentence[:m] + term + sentence[index + 1:]
    if "should be from" in sentence:
        new_sentence = sentence.split(" should be from ")
        term = new_sentence[0] + " from " + new_sentence[1] + " (preferred)"
        sentence = term[:]
    elif "could be from" in sentence:
        new_sentence = sentence.split("could be from")
        term = new_sentence[0] + "from " + new_sentence[1] + " (example)"
        sentence = term[:]
    elif "from" in sentence and "if covered" in sentence:
        sentence = sentence.replace("if covered", "(extensible)")
    elif "from" in sentence and 'VS' in sentence:
        sentence = sentence + " (required)"

    return sentence



if __name__ == "__main__":
    path_name = sys.argv[1]
    cimpl_6_path = sys.argv[2]
    comment_hash = dict()
    replacements = dict()
    file_elements = dict()
    #Get all of the lines associated with a particular namespace.
    for file in files(path_name):
        if '.txt' in file and not '_vs' in file and not '_map' in file and not '.html' in file and not '.json' in file and not 'ig-' in file:
            file_name = path_name + file
            comment_hash[file] = []
            with open(file_name, 'r') as f:
                for line in f:
                    comment_hash[file].append(line)
            particular_comments = []
            file_elements[file] = dict()
            current_element = 'DataElement 6.0'
            file_elements[file]['DataElement 6.0'] = []
            next_line = ''
            line = 0
            while line < len(comment_hash[file]) - 1:
                if '//' in comment_hash[file][line] and not '://' in comment_hash[file][line]:
                    slash_indices = [m.start() for m in re.finditer('//', comment_hash[file][line])]
                    extraction = slash_indices[0]
                    text = comment_hash[file][line][:extraction]
                    comment = comment_hash[file][line][extraction:]

                    if len(text.rstrip().strip()) > 0:
                        if is_unfinished_str(text):
                            for s in range(line -1, -1,-1):
                                if is_unfinished_str(comment_hash[file][s]):
                                    next_line = comment_hash[file][s]
                                    break
                        else:
                            next_line = text
                    else:
                        for l in range(line + 1, len(comment_hash[file])):
                            if not comment_hash[file][l].rstrip().strip().startswith('//'):
                                next_line = comment_hash[file][l]
                                if '//' in comment_hash[file][l] and not '://' in comment_hash[file][l]:
                                    slash_indices = [m.start() for m in re.finditer('//', comment_hash[file][l])]
                                    extraction = slash_indices[0]
                                    next_line = comment_hash[file][l][:extraction]
                                elif '//' in comment_hash[file][l] and '://' in comment_hash[file][l]:
                                    slash_indices = [m.start() for m in re.finditer('//', comment_hash[file][l])]
                                    http_indices = set([m.start() for m in re.finditer('://', comment_hash[file][l])])
                                    if len(http_indices) != len(slash_indices):
                                        for i in range(0, len(slash_indices)):
                                            if not slash_indices[i] - 1 in http_indices:
                                                next_line = comment_hash[file][l][:slash_indices[i]]
                                                break
                                break
                        #next_line = comment_hash[file][line + 1]
                    if 'Element:' in next_line:
                        current_element = next_line.split(":")[1].rstrip().strip()
                        file_elements[file][current_element] = []
                    file_elements[file][current_element].append((next_line, comment))

                elif '//' in comment_hash[file][line] and '://' in comment_hash[file][line]:
                    slash_indices = [m.start() for m in re.finditer('//', comment_hash[file][line])]
                    http_indices = set([m.start() for m in re.finditer('://', comment_hash[file][line])])
                    if len(http_indices) == len(slash_indices):
                        #next_line = comment_hash[file][line + 1]
                        for l in range(line + 1, len(comment_hash[file])):
                            if not comment_hash[file][l].rstrip().strip().startswith('//'):
                                next_line = comment_hash[file][l]
                                if '//' in comment_hash[file][l] and not '://' in comment_hash[file][l]:
                                    slash_indices = [m.start() for m in re.finditer('//', comment_hash[file][l])]
                                    extraction = slash_indices[0]
                                    next_line = comment_hash[file][line][:extraction]
                                elif '//' in comment_hash[file][l] and '://' in comment_hash[file][l]:
                                    slash_indices = [m.start() for m in re.finditer('//', comment_hash[file][l])]
                                    http_indices = set([m.start() for m in re.finditer('://', comment_hash[file][l])])
                                    if len(http_indices) != len(slash_indices):
                                        for i in range(0, len(slash_indices)):
                                            if not slash_indices[i] - 1 in http_indices:
                                                next_line = comment_hash[file][l][:slash_indices[i]]
                                                break
                                break
                    else:
                        for i in range(0, len(slash_indices)):
                            if not slash_indices[i] - 1 in http_indices:
                                text = comment_hash[file][line][:slash_indices[i]]
                                comment = comment_hash[file][line][slash_indices[i]:]
                                if len(text.rstrip().strip()) > 0:
                                    next_line = text
                                else:
                                    #next_line = comment_hash[file][line + 1]
                                    for l in range(line + 1, len(comment_hash[file])):
                                        if not comment_hash[file][l].rstrip().strip().startswith('//'):
                                            next_line = comment_hash[file][l]
                                            if '//' in comment_hash[file][l] and not '://' in comment_hash[file][l]:
                                                slash_indices = [m.start() for m in re.finditer('//', comment_hash[file][l])]
                                                extraction = slash_indices[0]
                                                next_line = comment_hash[file][line][:extraction]
                                            elif '//' in comment_hash[file][l] and '://' in comment_hash[file][l]:
                                                slash_indices = [m.start() for m in re.finditer('//', comment_hash[file][l])]
                                                http_indices = set([m.start() for m in re.finditer('://', comment_hash[file][l])])
                                                if len(http_indices) != len(slash_indices):
                                                    for i in range(0, len(slash_indices)):
                                                        if not slash_indices[i] - 1 in http_indices:
                                                            next_line = comment_hash[file][l][:slash_indices[i]]
                                                            break
                                            break

                                if 'Element:' in next_line:
                                    current_element = prev_line.split(":")[1].rstrip().strip()
                                    if not current_element in file_elements[file]:
                                        file_elements[file][current_element] = []
                                file_elements[file][current_element].append((next_line, comment))
                                break
                elif '/*' in comment_hash[file][line]:
                    long_comment = comment_hash[file][line]
                    while not '*/' in comment_hash[file][line]:
                        line += 1
                        long_comment += comment_hash[file][line]
                    if line == len(comment_hash[file]) - 1:
                        next_line = '\n'
                    else:
                        #next_line = comment_hash[file][line + 1]
                        for l in range(line + 1, len(comment_hash[file])):
                            if not comment_hash[file][l].rstrip().strip().startswith('//'):
                                next_line = comment_hash[file][l]
                                if '//' in comment_hash[file][l] and not '://' in comment_hash[file][l]:
                                    slash_indices = [m.start() for m in re.finditer('//', comment_hash[file][l])]
                                    extraction = slash_indices[0]
                                    next_line = comment_hash[file][l][:extraction]
                                elif '//' in comment_hash[file][l] and '://' in comment_hash[file][l]:
                                    slash_indices = [m.start() for m in re.finditer('//', comment_hash[file][l])]
                                    http_indices = set([m.start() for m in re.finditer('://', comment_hash[file][l])])
                                    if len(http_indices) != len(slash_indices):
                                        for i in range(0, len(slash_indices)):
                                            if not slash_indices[i] - 1 in http_indices:
                                                next_line = comment_hash[file][l][:slash_indices[i]]
                                                break
                                break
                    file_elements[file][current_element].append((next_line, long_comment))

                elif 'Element:' in comment_hash[file][line]:
                    current_element = comment_hash[file][line].split(":")[1].rstrip().strip()
                    if not current_element in file_elements[file]:
                        file_elements[file][current_element] = []
                    next_line = comment_hash[file][line + 1]
                    for l in range(line + 1, len(comment_hash[file])):
                        if not comment_hash[file][l].rstrip().strip().startswith('//'):
                            next_line = comment_hash[file][l]
                            if '//' in comment_hash[file][l] and not '://' in comment_hash[file][l]:
                                slash_indices = [m.start() for m in re.finditer('//', comment_hash[file][l])]
                                extraction = slash_indices[0]
                                next_line = comment_hash[file][line][:extraction]
                            elif '//' in comment_hash[file][l] and '://' in comment_hash[file][l]:
                                slash_indices = [m.start() for m in re.finditer('//', comment_hash[file][l])]
                                http_indices = set([m.start() for m in re.finditer('://', comment_hash[file][l])])
                                if len(http_indices) != len(slash_indices):
                                    for i in range(0, len(slash_indices)):
                                        if not slash_indices[i] - 1 in http_indices:
                                            next_line = comment_hash[file][l][:slash_indices[i]]
                                            break
                            break
                else:
                    if len(comment_hash[file][line].strip()) > 0:
                        for l in range(line + 1, len(comment_hash[file])):
                            if not comment_hash[file][l].rstrip().strip().startswith('//'):
                                next_line = comment_hash[file][l]
                                if '//' in comment_hash[file][l] and not '://' in comment_hash[file][l]:
                                    slash_indices = [m.start() for m in re.finditer('//', comment_hash[file][l])]
                                    extraction = slash_indices[0]
                                    next_line = comment_hash[file][l][:extraction]
                                elif '//' in comment_hash[file][l] and '://' in comment_hash[file][l]:
                                    slash_indices = [m.start() for m in re.finditer('//', comment_hash[file][l])]
                                    http_indices = set([m.start() for m in re.finditer('://', comment_hash[file][l])])
                                    if len(http_indices) != len(slash_indices):
                                        for i in range(0, len(slash_indices)):
                                            if not slash_indices[i] - 1 in http_indices:
                                                next_line = comment_hash[file][l][:slash_indices[i]]
                                                break
                                break
                        #next_line = comment_hash[file][line + 1]

                line += 1
    output_lines = []
    new_cimpl_hash = dict()
    for file in files(cimpl_6_path):
        if '.txt' in file and not '_vs' in file and not '_map' in file and not '.html' in file and not '.json' in file and not 'ig-' in file:
            file_name = cimpl_6_path + file
            with open(file_name, 'r') as f:
                all_lines = []
                namespace = ''
                new_cimpl_hash[file] = []
                for line in f:
                    new_cimpl_hash[file].append(line)


    output_dir = 'CommentReintegration/'
    if not os.path.exists(output_dir):
        os.makedirs(output_dir)
    added_comment_hash = dict()

    for k in new_cimpl_hash:
        all_terms = []
        current_term = ''
        comments = []
        added_comment_hash[k] = dict()
        for a in range(0, len(new_cimpl_hash[k])):
            if a == 0:
                initial_comments = file_elements[k]['DataElement 6.0']
                for c in range(0, len(initial_comments)):
                    if len(initial_comments[c][0]) == 0:
                        all_terms.append(initial_comments[c][1])
            if 'Grammar:' in new_cimpl_hash[k][a] or 'Entry:' in new_cimpl_hash[k][a] or 'Element:' in new_cimpl_hash[k][a] or 'Abstract:' in new_cimpl_hash[k][a] or 'Group:' in new_cimpl_hash[k][a]:
                if len(current_term) > 0:
                    for t in range(0, len(file_elements[k][current_term])):
                        if not t in added_comment_hash[k][current_term]:
                            if not file_elements[k][current_term][t][1].strip().startswith('/*'):
                                all_terms.append((' '*19) + file_elements[k][current_term][t][1])
                            else:
                                all_terms.append(file_elements[k][current_term][t][1])

                current_term = new_cimpl_hash[k][a].split(":")[1].rstrip().strip()
                added_comment_hash[k][current_term] = []
            if current_term in file_elements[k]:
                comments = file_elements[k][current_term]
                if len(new_cimpl_hash[k][a].rstrip().strip()) > 0:
                    added_comments = []
                    for b in range(0, len(comments)):
                        if len(comments[b][0]) == 0 or comments[b][0] == '\n':
                            continue
                        if b in added_comment_hash[k][current_term]:
                            continue
                        five_line = set(remove_empty_str(keyTerms(comments[b][0]).rstrip().strip().replace('\t',' ').split(" ")))
                        six_line = set(remove_empty_str(new_cimpl_hash[k][a].rstrip().strip().replace('\t','').split(" ")))
                        new_five_set = five_line - six_line
                        new_six_set = six_line - five_line

                        if len(new_five_set) <= 1 and len(new_six_set) <= 1:
                            if not comments[b][1].strip().startswith('/*'):
                                all_terms.append((' '*19) + comments[b][1])
                            else:
                                all_terms.append(comments[b][1])
                            added_comment_hash[k][current_term].append(b)
            all_terms.append(new_cimpl_hash[k][a])
            if a == len(new_cimpl_hash[k]) - 1:
                if len(current_term) > 0:
                    for t in range(0, len(file_elements[k][current_term])):
                        if not t in added_comment_hash[k][current_term]:
                            if not file_elements[k][current_term][t][1].strip().startswith('/*'):
                                all_terms.append((' '*19) + file_elements[k][current_term][t][1])
                            else:
                                all_terms.append(file_elements[k][current_term][t][1])



        file_name = output_dir + k
        a = open(file_name, 'w')
        for t in all_terms:
            a.write(t)
        a.close()
