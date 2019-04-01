import os
import sys
import re
import difflib

def remove_empty_str(lis):
    new_list = []
    for i in lis:
        if len(i) > 0:
            new_list.append(i)
    return new_list

def term_present(sentence):
    if 'Grammar' in sentence or 'Entry:' in sentence or 'Element:' in sentence or 'Abstract:' in sentence:
        return True
    return False

def files(path):
    for file in os.listdir(path):
        if os.path.isfile(os.path.join(path, file)):
            yield file

def keyTerms(sentence):
    sentence = sentence.replace('code', 'concept')
    sentence = sentence.replace('Coding', 'concept')
    sentence = sentence.replace('CodeableConcept', 'concept')
    sentence = sentence.replace('EntryElement:', 'Entry:')
    sentence = sentence.replace('Abstract Element:', 'Abstract:')
    sentence = sentence.replace('Based on:', 'Parent:')
    sentence = sentence.replace('value is type', 'only')
    sentence = sentence.replace('is type', 'substitute')
    while(sentence.find('ref(') != -1):
        m = sentence.find('ref(')
        index = m + 4
        term = ''
        while sentence[index] != ")":
            term += sentence[index]
            index += 1
        sentence = sentence[:m] + term + sentence[index + 1:]
    return sentence



if __name__ == "__main__":
    path_name = sys.argv[1]
    cimpl_6_path = sys.argv[2]
    comment_hash = dict()
    #Get all of the lines associated with a particular namespace.
    for file in files(path_name):
        if '.txt' in file and not '_vs' in file and not '_map' in file:
            file_name = path_name + file
            comment_hash[file] = []
            with open(file_name, 'r') as f:
                for line in f:
                    comment_hash[file].append(line)

    replacements = dict()
    file_elements = dict()
    for k in comment_hash:
        particular_comments = []
        file_elements[k] = dict()
        current_element = 'DataElement 6.0'
        prev_line = ''
        file_elements[k]['DataElement 6.0'] = []
        line = 0
        while line < len(comment_hash[k]):
            if '//' in comment_hash[k][line] and not '://' in comment_hash[k][line]:
                slash_indices = [m.start() for m in re.finditer('//', comment_hash[k][line])]
                extraction = slash_indices[0]
                text = comment_hash[k][line][:extraction]
                comment = comment_hash[k][line][extraction:]

                if len(text.rstrip().strip()) > 0:
                    prev_line = text
                if 'Element:' in prev_line:
                    current_element = prev_line.split(":")[1].rstrip().strip()
                    file_elements[k][current_element] = []
                file_elements[k][current_element].append((prev_line, comment))
                '''if k == 'brca.txt':
                    print(current_element)
                    print(comment)
                    print(file_elements[k])'''

            elif '//' in comment_hash[k][line] and '://' in comment_hash[k][line]:
                slash_indices = [m.start() for m in re.finditer('//', comment_hash[k][line])]
                http_indices = set([m.start() for m in re.finditer('://', comment_hash[k][line])])
                if len(http_indices) == len(slash_indices):
                    prev_line = comment_hash[k][line]
                else:
                    for i in range(0, len(slash_indices)):
                        if not slash_indices[i] - 1 in http_indices:
                            text = comment_hash[k][line][:slash_indices[i]]
                            comment = comment_hash[k][line][slash_indices[i]:]
                            if len(text.rstrip().strip()) > 0:
                                prev_line = text
                            if 'Element:' in prev_line:
                                current_element = prev_line.split(":")[1].rstrip().strip()
                                file_elements[k][current_element] = []
                            file_elements[k][current_element].append((prev_line, comment))
                            break

            elif '/*' in comment_hash[k][line]:
                long_comment = comment_hash[k][line]
                while not '*/' in comment_hash[k][line]:
                    line += 1
                    long_comment += comment_hash[k][line]

                file_elements[k][current_element].append((prev_line, long_comment))

            elif 'Element:' in comment_hash[k][line]:
                current_element = comment_hash[k][line].split(":")[1].rstrip().strip()
                #print(current_element)
                #print(k)
                file_elements[k][current_element] = []
                prev_line = comment_hash[k][line]
            else:
                if len(comment_hash[k][line].strip()) > 0:
                    prev_line = comment_hash[k][line]

            line += 1


    output_lines = []
    new_cimpl_hash = dict()
    for file in files(cimpl_6_path):
        if '.txt' in file and not '_vs' in file and not '_map' in file:
            file_name = cimpl_6_path + file
            with open(file_name, 'r') as f:
                all_lines = []
                namespace = ''
                new_cimpl_hash[file] = []
                for line in f:
                    new_cimpl_hash[file].append(line)

    output_dir = 'comments/'
    if not os.path.exists(output_dir):
        os.makedirs(output_dir)
    added_comment_hash = dict()
    for k in new_cimpl_hash:
        new_terms = []
        current_term = ''
        comments = []
        added_comment_hash[k] = dict()
        for a in range(0, len(new_cimpl_hash[k])):
            if a == 0:
                initial_comments = file_elements[k]['DataElement 6.0']
                for c in range(0, len(initial_comments)):
                    if len(initial_comments[c][0]) == 0:
                        new_terms.append(initial_comments[c][1])
            if 'Grammar:' in new_cimpl_hash[k][a] or 'Entry:' in new_cimpl_hash[k][a] or 'Element:' in new_cimpl_hash[k][a] or 'Abstract:' in new_cimpl_hash[k][a]:
                if len(current_term) > 0:
                    for t in range(0, len(file_elements[k][current_term])):
                        if not t in added_comment_hash[k][current_term]:
                            new_terms.append(('\t'*9) + file_elements[k][current_term][t][1])
                current_term = new_cimpl_hash[k][a].split(":")[1].rstrip().strip()
                added_comment_hash[k][current_term] = []
            new_terms.append(new_cimpl_hash[k][a])
            if current_term in file_elements[k]:
                comments = file_elements[k][current_term]
                if len(new_cimpl_hash[k][a].rstrip().strip()) > 0:
                    added_comments = []
                    for b in range(0, len(comments)):
                        if len(comments[b][0]) == 0:
                            continue
                        five_line = set(remove_empty_str(keyTerms(comments[b][0]).rstrip().strip().replace('\t',' ').split(" ")))
                        six_line = set(remove_empty_str(new_cimpl_hash[k][a].rstrip().strip().replace('\t','').split(" ")))
                        new_set = five_line - six_line
                        if len(new_set) <= 1:
                            new_terms.append(('\t'*9) + comments[b][1])
                            added_comment_hash[k][current_term].append(b)
        if k == 'brca.txt':
            print(file_elements[k])
            #print(new_cimpl_hash[k])
        file_name = output_dir + k
        a = open(file_name, 'w')
        for t in new_terms:
            a.write(t)
        a.close()
        #print(file_elements['brca.txt'])
